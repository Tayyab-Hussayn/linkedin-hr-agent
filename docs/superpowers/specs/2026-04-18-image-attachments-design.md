# Post Image Attachments — Design Spec

**Date:** 2026-04-18
**Status:** Approved
**Branch:** feature/image-attachments (from fix/production-readiness-v1.3.0)

## Overview

Allow users to attach up to 4 images to any post in the queue tab. Images are uploaded to the Flask server, stored on the filesystem, and published to LinkedIn alongside the post text via Playwright.

## Constraints

- Max 4 images per post
- Max 5MB per image file
- Accepted formats: JPEG, PNG, GIF
- Images stored in `playwright/uploads/` directory
- UUID-based filenames to prevent collisions and path traversal

## Database

### New table: `post_images`

```sql
CREATE TABLE IF NOT EXISTS post_images (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id       TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    filename      TEXT NOT NULL,
    original_name TEXT,
    mime_type     TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL,
    sort_order    INTEGER DEFAULT 0,
    created_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_post_images_post_id ON post_images(post_id);
```

`ON DELETE CASCADE` ensures images are cleaned up when a post is deleted. A separate cleanup task removes orphaned files from `uploads/` periodically.

## Flask API

### New endpoints

#### `POST /api/posts/<post_id>/images`
Upload images to a post. Multipart form data.

**Auth:** JWT required
**Validation:**
- Post must exist and belong to the authenticated user's client
- Post must be in `pending` or `approved` approval_status (not `rejected`)
- Total images for post must not exceed 4 after upload
- Each file: max 5MB, mime type must be `image/jpeg`, `image/png`, or `image/gif`

**Request:** `multipart/form-data` with field `images` (one or more files)

**Response:**
```json
{
    "status": "ok",
    "images": [
        {
            "id": "uuid",
            "filename": "uuid.jpg",
            "original_name": "photo.jpg",
            "mime_type": "image/jpeg",
            "size_bytes": 245000,
            "sort_order": 0,
            "url": "/api/images/uuid"
        }
    ]
}
```

**Filesystem:** Files saved to `uploads/<uuid>.<ext>` where ext is derived from mime type.

#### `GET /api/posts/<post_id>/images`
List images for a post.

**Auth:** JWT required
**Response:** Same `images` array format as upload response.

#### `GET /api/images/<image_id>`
Serve an image file. Returns the raw image with correct `Content-Type` header.

**Auth:** None (images are served by ID which is a UUID — effectively unguessable)

#### `DELETE /api/images/<image_id>`
Remove an image from a post.

**Auth:** JWT required, must own the post
**Side effects:** Deletes file from `uploads/`, deletes DB row, re-orders remaining images.

### Modified endpoints

#### `GET /api/posts` (existing)
Add `images` array to each post in the response. Each image object includes `id`, `original_name`, `mime_type`, `sort_order`, and `url`.

#### `GET /api/worker/due-posts` (existing)
Add `images` array to each post. Each image object includes `id`, `filename`, and `sort_order`. The worker uses `filename` to construct the filesystem path or download URL.

#### Image cleanup on post delete
When a post is deleted (if applicable), `ON DELETE CASCADE` removes DB rows. A helper function `cleanup_post_images(post_id)` deletes the actual files from disk. Called before any post deletion query.

## Dashboard (Next.js)

### PostCard component changes

Add an "Attach" button to the action bar (between Edit and Reject). Button shows a paperclip icon and image count badge when images exist.

**Upload flow:**
1. User clicks "Attach" → hidden `<input type="file" multiple accept="image/jpeg,image/png,image/gif">` triggered
2. Client-side validation: max 4 files total (considering existing), max 5MB each
3. Upload via `POST /api/posts/<post_id>/images` with FormData
4. On success, post card re-renders showing image thumbnails
5. Toast on error (file too large, too many images, server error)

**Image preview:**
- Thumbnails displayed below post text, above action buttons
- Each thumbnail has an X button to delete (calls `DELETE /api/images/<id>`)
- Thumbnails are small (64x64 or similar), clicking opens larger preview

### API client (api.ts)
New functions:
- `uploadPostImages(postId: string, files: File[]): Promise<ImageResponse>`
- `getPostImages(postId: string): Promise<Image[]>`
- `deletePostImage(imageId: string): Promise<void>`

These use raw `fetch` with FormData (not JSON) for upload, and `apiFetch` for get/delete.

### Types (types.ts)
```typescript
interface PostImage {
    id: string
    original_name: string
    mime_type: string
    size_bytes: number
    sort_order: number
    url: string
}

// Extend Post interface
interface Post {
    // ... existing fields
    images?: PostImage[]
}
```

## Playwright (linkedin_actions.py)

### Modified function: `do_post`

```python
async def do_post(page, content: str, image_paths: list[str] | None = None) -> str:
```

**Image upload flow (inserted between opening composer and pasting text):**
1. After clicking "Start a post" and waiting for editor
2. If `image_paths` is provided and non-empty:
   a. Click the media/image button in the post composer toolbar (camera/image icon)
   b. Use `page.set_input_files()` or `file_chooser` event to upload all images at once
   c. Wait for upload thumbnails to appear in the composer
   d. Wait a humanized delay (1-3 seconds)
3. Then paste text content (existing logic)
4. Then click Post (existing logic)

**LinkedIn composer selectors for media button:**
- The toolbar has an image icon button — need to identify the correct selector
- LinkedIn's file input accepts multiple files
- After upload, thumbnails appear in the post composer area

**Fallback:** If image upload fails (selector not found, upload timeout), log the error and proceed with text-only post. Never fail the entire post because of image upload failure.

## Queue Worker (queue_worker_v5.py)

### Modified publish flow

1. Fetch due posts from `/api/worker/due-posts` (now includes `images` array)
2. For each post with images:
   a. Download images from Flask API to a temp directory: `GET /api/images/<id>`
   b. Pass list of local file paths to the Playwright subprocess
3. Subprocess payload gains new field: `"image_paths": ["/tmp/qalam/img1.jpg", ...]`
4. After publish (success or fail), clean up temp files

**Temp directory:** `tempfile.mkdtemp(prefix='qalam_')` — cleaned up after each post attempt.

**Download:** Uses `requests.get(f"{api_url}/api/images/{image_id}")` with streaming to write files. Filenames preserve original extension for LinkedIn compatibility.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Upload file too large | 400 with message, toast in UI |
| Upload wrong format | 400 with message, toast in UI |
| Too many images (>4) | 400 with count message, toast in UI |
| Upload network error | Toast "Failed to upload", no partial state |
| Image download fails in worker | Log warning, publish text-only |
| LinkedIn media button not found | Log warning, publish text-only |
| LinkedIn image upload timeout | Log warning, publish text-only |
| Post deleted with images | CASCADE deletes DB rows, cleanup function deletes files |

## File Structure Changes

```
playwright/
├── uploads/              # NEW — image storage directory
│   └── .gitkeep
├── action_server.py      # Modified — new image endpoints, modified posts/due-posts
├── linkedin_actions.py   # Modified — do_post accepts image_paths
├── queue_worker_v5.py    # Modified — download images, pass to subprocess
│
dashboard/src/
├── components/ui/
│   └── PostCard.tsx      # Modified — attach button, image preview, delete
├── app/queue/
│   └── page.tsx          # Modified — handle image state in post lifecycle
├── lib/
│   ├── api.ts            # Modified — new image API functions
│   └── types.ts          # Modified — PostImage interface, extend Post
│
database/
└── schema.sql            # Modified — add post_images table
```

## Out of Scope

- Image cropping/editing in the UI
- Drag-and-drop reordering of images
- AI-generated images
- Image optimization/compression (uploaded as-is)
- CDN or cloud storage (local filesystem only)
- Images on scheduled/history pages (queue tab only for now)
