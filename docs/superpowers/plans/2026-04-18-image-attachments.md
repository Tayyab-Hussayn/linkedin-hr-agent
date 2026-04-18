# Image Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to attach up to 4 images to posts in the queue tab, stored on the server, and published to LinkedIn alongside post text.

**Architecture:** Filesystem-based image storage in `playwright/uploads/` with metadata in a `post_images` DB table. Flask API handles upload/serve/delete. Dashboard PostCard gets an attach button + thumbnail preview. Queue worker downloads images to temp dir before passing paths to Playwright. `do_post()` gains optional `image_paths` param to upload images via LinkedIn's post composer.

**Tech Stack:** PostgreSQL, Flask (multipart upload), Next.js 14 (React), Playwright (file chooser API), Python `tempfile`

---

## File Structure

| Action | File | Purpose |
|--------|------|---------|
| Create | `playwright/uploads/.gitkeep` | Image storage directory |
| Modify | `database/schema.sql` | Add `post_images` table |
| Modify | `playwright/action_server.py` | Image upload/serve/delete endpoints, modify `/api/posts` and `/api/worker/due-posts` |
| Modify | `dashboard/src/lib/types.ts` | Add `PostImage` interface, extend `Post` |
| Modify | `dashboard/src/lib/api.ts` | Add image upload/delete API functions |
| Modify | `dashboard/src/components/ui/PostCard.tsx` | Attach button, image thumbnails, delete |
| Modify | `dashboard/src/app/queue/page.tsx` | Wire image state through post lifecycle |
| Modify | `playwright/linkedin_actions.py` | `do_post()` accepts and uploads images |
| Modify | `playwright/queue_worker_v5.py` | Download images, pass paths to subprocess |

---

### Task 1: Database — Add `post_images` table

**Files:**
- Modify: `database/schema.sql:115` (after posts table)

- [ ] **Step 1: Add post_images table to schema.sql**

Add after the posts table (line 115) and before engagement_log:

```sql
-- ─── post_images ──────────────────────────────────────────────────────────────
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
```

Add index after the existing indexes block (after line 167):

```sql
CREATE INDEX IF NOT EXISTS idx_post_images_post_id ON post_images(post_id);
```

- [ ] **Step 2: Run migration on dev database**

```bash
docker exec -i la_postgres psql -U hragent -d linkedin_agent <<'SQL'
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
CREATE INDEX IF NOT EXISTS idx_post_images_post_id ON post_images(post_id);
SQL
```

Expected: `CREATE TABLE` and `CREATE INDEX` output.

- [ ] **Step 3: Create uploads directory**

```bash
mkdir -p playwright/uploads
touch playwright/uploads/.gitkeep
```

- [ ] **Step 4: Add uploads to .gitignore**

Append to the project `.gitignore` (or create if it doesn't exist):
```
playwright/uploads/*
!playwright/uploads/.gitkeep
```

- [ ] **Step 5: Commit**

```bash
git add database/schema.sql playwright/uploads/.gitkeep .gitignore
git commit -m "feat(db): add post_images table and uploads directory"
```

---

### Task 2: Flask API — Image upload, serve, and delete endpoints

**Files:**
- Modify: `playwright/action_server.py` (add after the `/api/approve` endpoint block, around line 800)

- [ ] **Step 1: Add imports and config at top of action_server.py**

Add to the imports section (after line 17):

```python
import os
import uuid
from pathlib import Path
from werkzeug.utils import secure_filename
```

Add after the `app.config['MAX_CONTENT_LENGTH']` line (after line 26):

```python
UPLOAD_DIR = Path(__file__).parent / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)
ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/gif'}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB
MAX_IMAGES_PER_POST = 4
MIME_TO_EXT = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif'}
```

- [ ] **Step 2: Add helper function to fetch images for posts**

Add after the `db_query` function (after line 98):

```python
def get_post_images(post_id):
    """Fetch images for a single post, returning list of dicts with url."""
    rows = db_query(
        "SELECT id, original_name, mime_type, size_bytes, sort_order "
        "FROM post_images WHERE post_id = %s ORDER BY sort_order",
        [post_id]
    )
    for row in rows:
        row['url'] = f'/api/images/{row["id"]}'
    return rows


def get_posts_images_bulk(post_ids):
    """Fetch images for multiple posts at once, returning {post_id: [images]}."""
    if not post_ids:
        return {}
    placeholders = ','.join(['%s'] * len(post_ids))
    rows = db_query(
        f"SELECT id, post_id, original_name, mime_type, size_bytes, sort_order "
        f"FROM post_images WHERE post_id IN ({placeholders}) ORDER BY sort_order",
        post_ids
    )
    result = {}
    for row in rows:
        pid = row.pop('post_id')
        row['url'] = f'/api/images/{row["id"]}'
        result.setdefault(pid, []).append(row)
    return result
```

- [ ] **Step 3: Add POST /api/posts/<post_id>/images endpoint**

Add after the `/api/approve` endpoint block (around line 800):

```python
@app.route('/api/posts/<post_id>/images', methods=['POST', 'OPTIONS'])
@require_auth
def upload_post_images(post_id):
    """Upload up to 4 images for a post."""
    # Verify post exists and belongs to user
    posts = db_query("SELECT id, client_id, approval_status FROM posts WHERE id = %s", [post_id])
    if not posts:
        return cors_response({"status": "error", "message": "Post not found"}, 404)
    post = posts[0]
    if post['client_id'] != request.current_user['client_id'] \
       and request.current_user.get('role') != 'admin':
        return cors_response({"status": "error", "message": "Forbidden"}, 403)
    if post['approval_status'] == 'rejected':
        return cors_response({"status": "error", "message": "Cannot attach images to rejected post"}, 400)

    # Check existing image count
    existing = db_query(
        "SELECT COUNT(*)::int as cnt FROM post_images WHERE post_id = %s", [post_id]
    )
    existing_count = existing[0]['cnt'] if existing else 0

    files = request.files.getlist('images')
    if not files:
        return cors_response({"status": "error", "message": "No images provided"}, 400)
    if existing_count + len(files) > MAX_IMAGES_PER_POST:
        return cors_response({
            "status": "error",
            "message": f"Too many images. Max {MAX_IMAGES_PER_POST}, currently have {existing_count}."
        }, 400)

    uploaded = []
    for i, f in enumerate(files):
        # Validate mime type
        if f.content_type not in ALLOWED_IMAGE_TYPES:
            return cors_response({
                "status": "error",
                "message": f"Invalid file type: {f.content_type}. Allowed: JPEG, PNG, GIF"
            }, 400)

        # Read file data and check size
        data = f.read()
        if len(data) > MAX_IMAGE_SIZE:
            return cors_response({
                "status": "error",
                "message": f"File '{f.filename}' exceeds 5MB limit"
            }, 400)

        # Generate unique filename
        ext = MIME_TO_EXT.get(f.content_type, '.jpg')
        image_id = str(uuid.uuid4())
        stored_name = f"{image_id}{ext}"
        filepath = UPLOAD_DIR / stored_name

        # Write file
        filepath.write_bytes(data)

        # Insert DB record
        original = secure_filename(f.filename or 'image') or 'image'
        sort = existing_count + i
        db_query(
            "INSERT INTO post_images (id, post_id, filename, original_name, mime_type, size_bytes, sort_order) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            [image_id, post_id, stored_name, original, f.content_type, len(data), sort],
            fetch=False
        )

        uploaded.append({
            "id": image_id,
            "filename": stored_name,
            "original_name": original,
            "mime_type": f.content_type,
            "size_bytes": len(data),
            "sort_order": sort,
            "url": f"/api/images/{image_id}"
        })

    return cors_response({"status": "ok", "images": uploaded})
```

- [ ] **Step 4: Add GET /api/posts/<post_id>/images endpoint**

```python
@app.route('/api/posts/<post_id>/images', methods=['GET', 'OPTIONS'])
@require_auth
def list_post_images(post_id):
    """List images for a post."""
    images = get_post_images(post_id)
    return cors_response({"status": "ok", "images": images})
```

- [ ] **Step 5: Add GET /api/images/<image_id> endpoint (serve file)**

```python
@app.route('/api/images/<image_id>', methods=['GET', 'OPTIONS'])
def serve_image(image_id):
    """Serve an image file by ID."""
    rows = db_query(
        "SELECT filename, mime_type FROM post_images WHERE id = %s", [image_id]
    )
    if not rows:
        return cors_response({"status": "error", "message": "Image not found"}, 404)

    filepath = UPLOAD_DIR / rows[0]['filename']
    if not filepath.exists():
        return cors_response({"status": "error", "message": "File missing"}, 404)

    from flask import send_file
    return send_file(str(filepath), mimetype=rows[0]['mime_type'])
```

- [ ] **Step 6: Add DELETE /api/images/<image_id> endpoint**

```python
@app.route('/api/images/<image_id>', methods=['DELETE', 'OPTIONS'])
@require_auth
def delete_image(image_id):
    """Delete an image from a post."""
    rows = db_query(
        "SELECT pi.id, pi.filename, pi.post_id, p.client_id "
        "FROM post_images pi JOIN posts p ON p.id = pi.post_id "
        "WHERE pi.id = %s",
        [image_id]
    )
    if not rows:
        return cors_response({"status": "error", "message": "Image not found"}, 404)

    row = rows[0]
    if row['client_id'] != request.current_user['client_id'] \
       and request.current_user.get('role') != 'admin':
        return cors_response({"status": "error", "message": "Forbidden"}, 403)

    # Delete file from disk
    filepath = UPLOAD_DIR / row['filename']
    if filepath.exists():
        filepath.unlink()

    # Delete DB record
    db_query("DELETE FROM post_images WHERE id = %s", [image_id], fetch=False)

    # Re-order remaining images
    db_query(
        "WITH ranked AS ("
        "  SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order) - 1 AS new_order "
        "  FROM post_images WHERE post_id = %s"
        ") UPDATE post_images SET sort_order = ranked.new_order "
        "FROM ranked WHERE post_images.id = ranked.id",
        [row['post_id']],
        fetch=False
    )

    return cors_response({"status": "ok"})
```

- [ ] **Step 7: Modify GET /api/posts to include images**

In the `get_posts()` function (line 560-609), after the date formatting loop (line 603), add:

```python
    # Attach images to each post
    post_ids = [r['id'] for r in rows]
    images_map = get_posts_images_bulk(post_ids)
    for row in rows:
        row['images'] = images_map.get(row['id'], [])
```

- [ ] **Step 8: Modify GET /api/worker/due-posts to include images**

In the `worker_get_due_posts()` function (line 1056-1090), after the date formatting loop (line 1088), add:

```python
    # Attach image filenames for worker
    post_ids = [r['id'] for r in rows]
    if post_ids:
        placeholders = ','.join(['%s'] * len(post_ids))
        img_rows = db_query(
            f"SELECT id, post_id, filename, sort_order "
            f"FROM post_images WHERE post_id IN ({placeholders}) ORDER BY sort_order",
            post_ids
        )
        img_map = {}
        for ir in img_rows:
            img_map.setdefault(ir['post_id'], []).append({
                'id': ir['id'],
                'filename': ir['filename'],
                'sort_order': ir['sort_order']
            })
        for row in rows:
            row['images'] = img_map.get(row['id'], [])
```

- [ ] **Step 9: Commit**

```bash
git add playwright/action_server.py
git commit -m "feat(api): add image upload, serve, delete endpoints and attach images to post listings"
```

---

### Task 3: Dashboard — TypeScript types and API client

**Files:**
- Modify: `dashboard/src/lib/types.ts:1-16`
- Modify: `dashboard/src/lib/api.ts`

- [ ] **Step 1: Add PostImage interface and extend Post in types.ts**

Add `PostImage` interface before the `Post` interface, and add `images` field to `Post`:

```typescript
export interface PostImage {
  id: string
  original_name: string
  mime_type: string
  size_bytes: number
  sort_order: number
  url: string
}

export interface Post {
  id: string
  client_id: string
  client_name: string
  content: string
  topic_pillar: string
  post_format: string
  approval_status: 'pending' | 'approved' | 'rejected'
  post_status: 'draft' | 'publishing' | 'published' | 'failed' | 'skipped'
  approval_note: string | null
  estimated_words: number
  created_at: string
  approved_at: string | null
  published_at: string | null
  scheduled_for: string | null
  images?: PostImage[]
}
```

- [ ] **Step 2: Add image API functions to api.ts**

Add the import for `PostImage` at the top of api.ts:

```typescript
import { Post, Stats, PillarStat, DailyActivity, PostImage } from './types'
```

Add these functions inside the `api` object (before the closing `}`):

```typescript
  // Upload images to a post
  async uploadPostImages(postId: string, files: File[]): Promise<{ status: string; images?: PostImage[]; message?: string }> {
    const formData = new FormData()
    files.forEach(file => formData.append('images', file))

    const headers: Record<string, string> = {}
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('postflow_token')
      if (token) headers['Authorization'] = `Bearer ${token}`
    }

    try {
      const res = await apiFetch(`${getApiUrl()}/api/posts/${postId}/images`, {
        method: 'POST',
        headers,  // No Content-Type — browser sets multipart boundary
        body: formData
      })
      const text = await res.text()
      if (!text) return { status: 'error', message: 'Empty response' }
      const data = JSON.parse(text)
      if (!res.ok) return { status: 'error', message: data.message || 'Upload failed' }
      return data
    } catch (error) {
      console.error('Error uploading images:', error)
      return { status: 'error', message: 'Upload failed' }
    }
  },

  // Delete an image
  async deletePostImage(imageId: string): Promise<{ status: string }> {
    try {
      const res = await apiFetch(`${getApiUrl()}/api/images/${imageId}`, {
        method: 'DELETE',
        headers: getHeaders()
      })
      if (!res.ok) return { status: 'error' }
      return { status: 'ok' }
    } catch {
      return { status: 'error' }
    }
  },
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/lib/types.ts dashboard/src/lib/api.ts
git commit -m "feat(dashboard): add PostImage type and image upload/delete API functions"
```

---

### Task 4: Dashboard — PostCard image attach UI

**Files:**
- Modify: `dashboard/src/components/ui/PostCard.tsx`

- [ ] **Step 1: Add imports and state for images**

Update the lucide-react import (line 4):

```typescript
import { ThumbsUp, Edit3, ThumbsDown, Loader2, Clock, Copy, Check, Paperclip, X, Image as ImageIcon } from 'lucide-react'
```

Add import for api and PostImage:

```typescript
import { api } from '@/lib/api'
import { PostImage } from '@/lib/types'
```

Add import for `useAppContext`:

```typescript
import { useAppContext } from '@/context/AppContext'
```

- [ ] **Step 2: Add image state and handlers inside PostCard component**

After the existing state declarations (after line 34), add:

```typescript
  const [images, setImages] = useState<PostImage[]>(post.images || [])
  const [isUploading, setIsUploading] = useState(false)
  const { showToast } = useAppContext()

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAttachClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    // Client-side validation
    const remaining = MAX_IMAGES_PER_POST - images.length
    if (files.length > remaining) {
      showToast(`Can only add ${remaining} more image${remaining !== 1 ? 's' : ''}`, 'warning')
      return
    }

    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        showToast(`"${file.name}" exceeds 5MB limit`, 'error')
        return
      }
      if (!['image/jpeg', 'image/png', 'image/gif'].includes(file.type)) {
        showToast(`"${file.name}" is not a supported format (JPEG, PNG, GIF)`, 'error')
        return
      }
    }

    setIsUploading(true)
    try {
      const result = await api.uploadPostImages(post.id, files)
      if (result.status === 'ok' && result.images) {
        setImages(prev => [...prev, ...result.images!])
        showToast(`${files.length} image${files.length > 1 ? 's' : ''} attached`, 'success')
      } else {
        showToast(result.message || 'Upload failed', 'error')
      }
    } catch {
      showToast('Failed to upload images', 'error')
    } finally {
      setIsUploading(false)
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDeleteImage = async (imageId: string) => {
    const result = await api.deletePostImage(imageId)
    if (result.status === 'ok') {
      setImages(prev => prev.filter(img => img.id !== imageId))
    } else {
      showToast('Failed to remove image', 'error')
    }
  }
```

Also add at the top of the component (after line 25):

```typescript
  const MAX_IMAGES_PER_POST = 4
```

Add `useRef` to the React import:

```typescript
import { useState, useEffect, useRef } from 'react'
```

- [ ] **Step 3: Add image preview section in PostCard render**

After the Meta section (after line 237, the closing `</div>` of the meta row), add the image thumbnails and hidden file input:

```tsx
      {/* Image Attachments */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {images.map((img) => (
            <div key={img.id} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-stroke">
              <img
                src={`${typeof window !== 'undefined' ? localStorage.getItem('api_url') || process.env.NEXT_PUBLIC_API_URL || 'https://api.byqalam.com' : ''}${img.url}`}
                alt={img.original_name}
                className="w-full h-full object-cover"
              />
              {showActions && (
                <button
                  onClick={() => handleDeleteImage(img.id)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/gif"
        onChange={handleFileSelect}
        className="hidden"
      />
```

- [ ] **Step 4: Add Attach button to the actions bar**

In the actions section (between the Edit button and Reject button, around line 260), add:

```tsx
          <button
            onClick={handleAttachClick}
            disabled={isApproving || isRejecting || isUploading || images.length >= MAX_IMAGES_PER_POST}
            className="relative px-4 py-2.5 border border-stroke text-muted hover:border-accent/50 hover:text-accent rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={images.length >= MAX_IMAGES_PER_POST ? 'Max 4 images' : 'Attach images'}
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Paperclip className="w-4 h-4" />
            )}
            {images.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-accent text-bg text-xs rounded-full flex items-center justify-center font-bold">
                {images.length}
              </span>
            )}
          </button>
```

- [ ] **Step 5: Add image thumbnails in Full Post Modal**

In the full post modal content area (after the `<p>` tag at line 493-495), add image display:

```tsx
              {images.length > 0 && (
                <div className="flex flex-wrap gap-3 mt-4">
                  {images.map((img) => (
                    <div key={img.id} className="rounded-lg overflow-hidden border border-stroke">
                      <img
                        src={`${typeof window !== 'undefined' ? localStorage.getItem('api_url') || process.env.NEXT_PUBLIC_API_URL || 'https://api.byqalam.com' : ''}${img.url}`}
                        alt={img.original_name}
                        className="max-h-48 object-contain"
                      />
                    </div>
                  ))}
                </div>
              )}
```

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/components/ui/PostCard.tsx
git commit -m "feat(ui): add image attach button, thumbnail preview, and delete to PostCard"
```

---

### Task 5: Dashboard — Queue page wiring

**Files:**
- Modify: `dashboard/src/app/queue/page.tsx`

This task is minimal — `PostCard` already manages its own image state internally using `post.images` from the API response. The queue page fetches posts via `api.getPosts('pending', 20)` which now includes `images` in the response (from Task 2 Step 7).

- [ ] **Step 1: Verify queue page works with images**

No code changes needed in `queue/page.tsx`. The `getPosts` API already returns the `images` array, and `PostCard` reads `post.images` from props.

Run the dashboard build to verify no TypeScript errors:

```bash
cd dashboard && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Commit (if any fixes needed)**

Only commit if build errors required fixes:

```bash
git add -A && git commit -m "fix: resolve TypeScript errors in queue page"
```

---

### Task 6: Playwright — Add image upload to `do_post()`

**Files:**
- Modify: `playwright/linkedin_actions.py:66-112` (run function) and `169-386` (do_post function)

- [ ] **Step 1: Update do_post signature and add image upload logic**

Change the `do_post` function signature (line 169):

```python
async def do_post(page, content: str, image_paths: list = None) -> str:
```

After STEP 2 (clicking "Start a post" and waiting for it, after line 233 `"[STEP 2 DONE] Clicked Start a post"`), insert a new step for image upload BEFORE STEP 3 (editor interaction):

```python
        # STEP 2.5 - Upload images if provided
        if image_paths:
            print(f"[STEP 2.5 START] Uploading {len(image_paths)} image(s)", file=sys.stderr)
            try:
                # Find the media/image button in the post composer toolbar
                media_btn = None

                # Try aria-label selectors for the image/photo button
                for selector in [
                    'button[aria-label="Add a photo"]',
                    'button[aria-label="Add media"]',
                    'button[aria-label="Add a image"]',
                    'button[aria-label="Photo"]',
                    '.share-creation-state__action-btn--media',
                    'button.image-sharing-detour-button',
                ]:
                    try:
                        btn = page.locator(selector).first
                        if await btn.count() > 0:
                            await btn.wait_for(state="visible", timeout=5000)
                            media_btn = btn
                            print(f"[STEP 2.5] Found media button: {selector}", file=sys.stderr)
                            break
                    except Exception:
                        continue

                if not media_btn:
                    # Fallback: try finding by icon/svg in toolbar
                    try:
                        media_btn = page.locator('[data-test-icon="image-medium"]').first
                        await media_btn.wait_for(state="visible", timeout=3000)
                        print("[STEP 2.5] Found media button via data-test-icon", file=sys.stderr)
                    except Exception:
                        pass

                if media_btn:
                    await random_delay(0.5, 1.0)

                    # Use file chooser pattern — click media button and handle dialog
                    async with page.expect_file_chooser(timeout=10000) as fc_info:
                        await media_btn.click()

                    file_chooser = await fc_info.value
                    await file_chooser.set_files(image_paths)

                    print(f"[STEP 2.5] Files set: {image_paths}", file=sys.stderr)

                    # Wait for upload thumbnails to appear
                    await random_delay(3, 5)

                    # Verify images loaded by checking for image preview elements
                    try:
                        await page.wait_for_selector(
                            '.share-creation-state__image-container, '
                            '.media-preview, '
                            'img[class*="image-sharing"]',
                            timeout=15000
                        )
                        print("[STEP 2.5 DONE] Images uploaded to composer", file=sys.stderr)
                    except Exception:
                        print("[STEP 2.5 WARN] Could not verify image previews, continuing anyway", file=sys.stderr)

                    await random_delay(1, 2)
                else:
                    print("[STEP 2.5 WARN] Media button not found — posting text-only", file=sys.stderr)

            except Exception as e:
                print(f"[STEP 2.5 WARN] Image upload failed: {e} — posting text-only", file=sys.stderr)
```

- [ ] **Step 2: Update the run() function to pass image_paths**

Modify the `run()` function (line 111-112) to pass image_paths:

```python
            if action == "post":
                result = await do_post(page, args["content"], args.get("image_paths"))
```

- [ ] **Step 3: Commit**

```bash
git add playwright/linkedin_actions.py
git commit -m "feat(playwright): add image upload support to do_post via file chooser API"
```

---

### Task 7: Queue Worker — Download images and pass to subprocess

**Files:**
- Modify: `playwright/queue_worker_v5.py:176-296`

- [ ] **Step 1: Add image download helper function**

Add after the `run_cleanup()` function (after line 173):

```python
def download_post_images(post):
    """Download images from Flask API to a temp directory. Returns list of local paths."""
    images = post.get('images', [])
    if not images:
        return []

    import tempfile
    tmp_dir = tempfile.mkdtemp(prefix='qalam_img_')
    paths = []

    for img in images:
        image_id = img['id']
        filename = img['filename']
        local_path = os.path.join(tmp_dir, filename)

        try:
            url = f'{API_BASE_URL}/api/images/{image_id}'
            r = requests.get(url, timeout=30, stream=True)
            r.raise_for_status()

            with open(local_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)

            paths.append(local_path)
            info(f"  Downloaded image: {filename}")
        except Exception as e:
            warn(f"  Failed to download image {image_id}: {e}")

    return paths
```

- [ ] **Step 2: Add cleanup helper**

Add right after `download_post_images`:

```python
def cleanup_temp_images(paths):
    """Remove temp image files and their parent directory."""
    if not paths:
        return
    import shutil
    try:
        # All paths share the same parent temp dir
        tmp_dir = os.path.dirname(paths[0])
        shutil.rmtree(tmp_dir, ignore_errors=True)
    except Exception:
        pass
```

- [ ] **Step 3: Modify publish_post to handle images**

In the `publish_post()` function, after the credentials check (after line 197-198), add image download:

```python
    # Download images if attached
    image_paths = download_post_images(post)
    if image_paths:
        info(f"  {len(image_paths)} image(s) downloaded for post {post_id[:8]}...")
```

Modify the payload (lines 199-205) to include image_paths:

```python
    payload = {
        "action":   "post",
        "post_id":  post_id,
        "content":  post['content'],
        "email":    linkedin_email,
        "password": linkedin_password,
        "image_paths": image_paths
    }
```

After the subprocess result handling (both success and failure paths), add cleanup. Add in the `finally` section or after all the result handling. The cleanest approach: wrap the subprocess section in a try/finally:

After the existing `except Exception as e:` block (around line 296), add a cleanup call. Actually, the simplest approach: add cleanup at the end of the function. Right before the function ends (or after all the exception handlers), ensure cleanup runs:

Find the end of the `try/except` blocks in `publish_post` and add after the last `except`:

```python
    finally:
        cleanup_temp_images(image_paths)
```

This requires restructuring the publish_post function slightly. The `image_paths` variable must be defined before the try block. Move the image download before the try block that runs subprocess, and wrap the subprocess section with its own try/finally for cleanup.

The full modified `publish_post` structure:

```python
def publish_post(post):
    """Run Playwright to publish a post to LinkedIn."""
    post_id     = post['id']
    retry_count = post.get('retry_count', 0)
    client_name = post.get('client_name', 'unknown')
    sched_local = post.get('scheduled_for_local', post.get('scheduled_for'))

    attempt_label = f"attempt {retry_count + 1}/{MAX_RETRIES}"
    info(f"Publishing {post_id[:8]}... for {client_name} [{attempt_label}]")
    info(f"Topic: {post.get('topic_pillar')} | Scheduled: {sched_local}")

    if not mark_publishing(post_id):
        warn(f"Post {post_id[:8]}... already locked — skipping")
        return

    linkedin_email    = post.get('linkedin_email', '')
    linkedin_password = post.get('linkedin_password', '')

    if not linkedin_email or not linkedin_password:
        error(f"Post {post_id[:8]}... missing LinkedIn credentials")
        update_post_failed(post_id, retry_count)
        return

    # Download images if attached
    image_paths = download_post_images(post)
    if image_paths:
        info(f"  {len(image_paths)} image(s) downloaded for post {post_id[:8]}...")

    payload = {
        "action":   "post",
        "post_id":  post_id,
        "content":  post['content'],
        "email":    linkedin_email,
        "password": linkedin_password,
        "image_paths": image_paths
    }

    try:
        # ... (existing python executable resolution code stays the same) ...
        # ... (existing subprocess.run call stays the same) ...
        # ... (existing result parsing stays the same) ...
        pass  # placeholder — keep all existing code between try and except blocks
    except subprocess.TimeoutExpired:
        error(f"TIMEOUT: {post_id[:8]}... exceeded 120 seconds")
        update_post_failed(post_id, retry_count)
    except Exception as e:
        error(f"EXCEPTION: {post_id[:8]}... — {e}")
        import traceback
        print(f"[DEBUG] Traceback: {traceback.format_exc()}", flush=True)
        update_post_failed(post_id, retry_count)
    finally:
        cleanup_temp_images(image_paths)
```

The key changes are:
1. `image_paths = download_post_images(post)` added before the try block
2. `"image_paths": image_paths` added to payload
3. `finally: cleanup_temp_images(image_paths)` added to ensure cleanup

- [ ] **Step 4: Commit**

```bash
git add playwright/queue_worker_v5.py
git commit -m "feat(worker): download post images and pass to playwright subprocess"
```

---

### Task 8: Build verification and integration test

- [ ] **Step 1: Verify dashboard builds**

```bash
cd dashboard && npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 2: Verify Flask server starts**

```bash
cd playwright && source venv/bin/activate && python -c "import action_server; print('OK')"
```

Expected: Prints "OK" without import errors.

- [ ] **Step 3: Verify database table exists**

```bash
docker exec la_postgres psql -U hragent -d linkedin_agent -c "\d post_images"
```

Expected: Shows table columns (id, post_id, filename, etc.)

- [ ] **Step 4: Manual smoke test checklist**

With Flask server + dashboard running:

1. Open queue page — posts should load normally (no regressions)
2. Click the paperclip icon on a post — file picker opens
3. Select a JPEG under 5MB — upload succeeds, thumbnail appears
4. Select a second image — appears next to first, badge shows "2"
5. Hover a thumbnail, click X — image removed
6. Try uploading a file >5MB — error toast appears
7. Try uploading a .txt file — error toast appears
8. Try adding 5 images — warning toast about max 4

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete image attachments feature — upload, preview, delete, publish"
```

---

### Task 9: Copy updated linkedin_actions.py to Tauri resources

Per CLAUDE.md, bundled resources must be kept in sync.

- [ ] **Step 1: Copy updated scripts**

```bash
cp playwright/linkedin_actions.py src-tauri/resources/
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/resources/linkedin_actions.py
git commit -m "chore: sync linkedin_actions.py to Tauri resources"
```
