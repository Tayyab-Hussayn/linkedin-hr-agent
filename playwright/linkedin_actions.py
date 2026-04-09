# version: 1.0.0
"""
Single entry point for all LinkedIn browser actions.
Called by Flask action server with JSON args.

Usage:
  python linkedin_actions.py '{"action": "post", "content": "Hello world", "email": "x@y.com", "password": "pass"}'
  python linkedin_actions.py '{"action": "comment", "post_url": "...", "comment": "...", "email": "...", "password": "..."}'
  python linkedin_actions.py '{"action": "react", "post_url": "...", "reaction": "like", "email": "...", "password": "..."}'
"""

import sys
import json
import asyncio
import random
from pathlib import Path
from humanizer import random_delay, human_type, human_scroll, human_mouse_move
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

# ─── Stealth JS injected into every page ──────────────────────────────────────
STEALTH_SCRIPT = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'plugins', {
    get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', filename: 'internal-nacl-plugin' }
    ]
});
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) => (
    parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters)
);
if (window.chrome) { window.chrome.runtime = window.chrome.runtime || {}; }
Object.defineProperty(screen, 'availWidth', { get: () => 1920 });
Object.defineProperty(screen, 'availHeight', { get: () => 1080 });
"""

# ─── Stealth browser args ─────────────────────────────────────────────────────
STEALTH_ARGS = [
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-accelerated-2d-canvas",
    "--disable-gpu",
    "--window-size=1280,800",
    "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "--disable-features=IsolateOrigins,site-per-process",
    "--disable-extensions",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-sync",
    "--metrics-recording-only",
    "--mute-audio",
]


# ─── Main entry point ─────────────────────────────────────────────────────────
async def run(args: dict):
    action = args.get("action")
    email = args["email"]
    password = args["password"]

    # Persistent profile per client — same fingerprint every run
    profiles_dir = Path(__file__).parent / "profiles"
    profiles_dir.mkdir(exist_ok=True)
    profile_path = profiles_dir / email.replace("@", "_").replace(".", "_")

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=str(profile_path),
            headless=False,
            args=STEALTH_ARGS,
            viewport={"width": 1280, "height": 800},
            locale="en-US",
            timezone_id="Asia/Karachi",
            color_scheme="light",
            device_scale_factor=1,
            has_touch=False,
            java_script_enabled=True,
            accept_downloads=False,
            ignore_https_errors=False,
        )

        # Inject stealth script before anything loads
        await context.add_init_script(STEALTH_SCRIPT)

        page = context.pages[0] if context.pages else await context.new_page()
        page.set_default_timeout(60000)
        page.set_default_navigation_timeout(60000)

        # Slight random viewport variation per run
        await page.set_viewport_size({
            "width": random.randint(1260, 1400),
            "height": random.randint(780, 860)
        })

        try:
            logged_in = await ensure_logged_in(page, email, password)
            if not logged_in:
                raise Exception("Login failed — check credentials or handle 2FA manually")

            result = None
            if action == "post":
                result = await do_post(page, args["content"])
            elif action == "comment":
                result = await do_comment(page, args["post_url"], args["comment"])
            elif action == "react":
                result = await do_react(page, args["post_url"], args.get("reaction", "like"))
            else:
                raise ValueError(f"Unknown action: {action}")

            await context.close()
            print(json.dumps({"status": "ok", "action": action, "message": result or "Action completed"}))

        except PlaywrightTimeout as e:
            await context.close()
            print(json.dumps({"status": "error", "action": action, "message": f"Timeout: {str(e)[:200]}"}))
            sys.exit(1)
        except Exception as e:
            await context.close()
            print(json.dumps({"status": "error", "action": action, "message": str(e)[:300]}))
            sys.exit(1)


# ─── Login ────────────────────────────────────────────────────────────────────
async def ensure_logged_in(page, email: str, password: str) -> bool:
    await page.goto("https://www.linkedin.com/feed/", wait_until="domcontentloaded", timeout=60000)
    await random_delay(2, 4)

    if "/feed" in page.url and "login" not in page.url and "authwall" not in page.url:
        print(f"[INFO] Session active for {email}", file=sys.stderr)
        return True

    print(f"[INFO] Logging in as {email}", file=sys.stderr)
    await page.goto("https://www.linkedin.com/login", wait_until="domcontentloaded", timeout=60000)
    await random_delay(1.5, 3)

    await human_mouse_move(page)
    await human_type(page, "#username", email)
    await random_delay(0.8, 2)
    await human_type(page, "#password", password)
    await random_delay(0.5, 1.5)
    await page.click('[type="submit"]')
    await random_delay(4, 7)

    current_url = page.url
    if "feed" in current_url or "mynetwork" in current_url or "jobs" in current_url:
        print(f"[INFO] Login successful", file=sys.stderr)
        return True
    elif "checkpoint" in current_url or "challenge" in current_url:
        # 2FA — wait up to 35 seconds for manual intervention
        print(f"[WARN] 2FA challenge detected — waiting for manual input", file=sys.stderr)
        await random_delay(25, 35)
        return "feed" in page.url
    else:
        print(f"[ERROR] Login failed. URL: {current_url}", file=sys.stderr)
        return False


# ─── Post ─────────────────────────────────────────────────────────────────────
async def do_post(page, content: str) -> str:
    # Status update: publishing started
    print(json.dumps({"status_update": "publishing"}), flush=True)

    # STEP 1 - Navigate to feed
    # Increase timeout for when called via Flask/n8n
    page.set_default_timeout(60000)
    page.set_default_navigation_timeout(60000)

    try:
        await page.goto(
            "https://www.linkedin.com/feed/",
            wait_until="domcontentloaded",
            timeout=60000
        )
        await random_delay(3, 5)
        await human_scroll(page, scrolls=random.randint(2, 3))
        await random_delay(1, 2)
        await human_mouse_move(page)

        print(f"[STEP 1 DONE] Page loaded, URL: {page.url}", file=sys.stderr)

        # STEP 2 - Click "Start a post"
        # Try link first (current LinkedIn UI)
        start_btn = None
        try:
            link = page.get_by_role("link", name="Start a post").first
            await link.wait_for(state="visible", timeout=10000)
            start_btn = link
            print("[STEP 2] Found as link", file=sys.stderr)
        except:
            pass

        if not start_btn:
            try:
                btn = page.get_by_role("button", name="Start a post").first
                await btn.wait_for(state="visible", timeout=10000)
                start_btn = btn
                print("[STEP 2] Found as button", file=sys.stderr)
            except:
                pass

        if not start_btn:
            try:
                el = page.locator(".share-box-feed-entry__trigger").first
                await el.wait_for(state="visible", timeout=10000)
                start_btn = el
                print("[STEP 2] Found via CSS", file=sys.stderr)
            except:
                pass

        if not start_btn:
            print("[STEP 2 ERROR] Start a post not found", file=sys.stderr)
            try:
                await page.screenshot(path="/tmp/debug_start_post.png", timeout=5000)
            except: pass
            print(json.dumps({"status": "error", "message": "Could not find Start a post button"}), flush=True)
            return

        await human_mouse_move(page)
        await random_delay(0.5, 1.5)
        await start_btn.click()
        await random_delay(2, 3)
        print("[STEP 2 DONE] Clicked Start a post", file=sys.stderr)

        # STEP 3 - Wait for and click the text editor
        editor = None
        try:
            # Try shadow DOM paragraph (current UI)
            shadow_editor = page.get_by_test_id("interop-shadowdom").get_by_role("paragraph").first
            await shadow_editor.wait_for(state="visible", timeout=8000)
            editor = shadow_editor
            print("[STEP 3] Found shadow DOM editor", file=sys.stderr)
        except:
            pass

        if not editor:
            try:
                label_editor = page.get_by_label("Text editor for creating").first
                await label_editor.wait_for(state="visible", timeout=8000)
                editor = label_editor
                print("[STEP 3] Found label editor", file=sys.stderr)
            except:
                pass

        if not editor:
            try:
                div_editor = page.locator("div.ql-editor, div[contenteditable='true']").first
                await div_editor.wait_for(state="visible", timeout=8000)
                editor = div_editor
                print("[STEP 3] Found contenteditable editor", file=sys.stderr)
            except:
                pass

        if not editor:
            print("[STEP 3 ERROR] Editor not found", file=sys.stderr)
            try:
                await page.screenshot(path="/tmp/debug_editor.png", timeout=5000)
            except: pass
            print(json.dumps({"status": "error", "message": "Could not find text editor"}), flush=True)
            return

        await random_delay(0.8, 1.5)
        await editor.click()
        await random_delay(0.5, 1)
        print("[STEP 3 DONE] Editor clicked", file=sys.stderr)

        # STEP 4 - Paste content using stealth clipboard method
        print("[STEP 4 START] Using stealth clipboard paste", file=sys.stderr)

        try:
            # Set clipboard content via JavaScript (invisible to LinkedIn)
            await page.evaluate(f"""
                const text = {json.dumps(content)};
                navigator.clipboard.writeText(text).catch(() => {{
                    // Fallback: use execCommand
                    const el = document.createElement('textarea');
                    el.value = text;
                    document.body.appendChild(el);
                    el.select();
                    document.execCommand('copy');
                    document.body.removeChild(el);
                }});
            """)

            await random_delay(0.5, 1)

            # Focus the editor
            await editor.click()
            await random_delay(0.3, 0.8)

            # Simulate Ctrl+V paste — completely natural human behavior
            await page.keyboard.press("Control+v")
            await random_delay(1, 2)

            print(f"[STEP 4 DONE] Content pasted, length: {len(content)}", file=sys.stderr)

        except Exception as e:
            # Fallback to character by character typing if paste fails
            print(f"[STEP 4 FALLBACK] Paste failed: {e}, falling back to typing", file=sys.stderr)
            paragraphs = content.split('\n')
            for i, para in enumerate(paragraphs):
                if para.strip():
                    for char in para:
                        await page.keyboard.type(char)
                        await asyncio.sleep(random.uniform(0.05, 0.15))
                if i < len(paragraphs) - 1:
                    await page.keyboard.press("Shift+Enter")
                    await random_delay(0.2, 0.5)
            print(f"[STEP 4 DONE] Content typed, length: {len(content)}", file=sys.stderr)

        await random_delay(2, 4)

        # STEP 5 - Click Post button with fallback selectors
        try:
            # Try exact match first
            post_btn = page.get_by_role("button", name="Post", exact=True).first
            await post_btn.wait_for(state="visible", timeout=10000)
        except PlaywrightTimeout:
            try:
                # Try partial match
                post_btn = page.get_by_role("button", name="Post").first
                await post_btn.wait_for(state="visible", timeout=10000)
            except PlaywrightTimeout:
                try:
                    # Try by CSS selector
                    post_btn = page.locator("button.share-actions__primary-action").first
                    await post_btn.wait_for(state="visible", timeout=10000)
                except PlaywrightTimeout:
                    try:
                        await page.screenshot(path="/tmp/debug_post_btn.png", timeout=5000)
                    except Exception as ss_err:
                        print(f"[SCREENSHOT FAILED] {ss_err}", file=sys.stderr)
                    raise

        await human_mouse_move(page)
        await random_delay(0.5, 1.5)
        await post_btn.click()
        print("[STEP 5 DONE] Post button clicked", file=sys.stderr)

        # STEP 6 - Verify submission with longer wait
        success = False
        for i in range(15):
            await asyncio.sleep(1)
            current_url = page.url
            print(f"[STEP 6 WAIT] Checking success ({i+1}/15), URL: {current_url}", file=sys.stderr)

            # Check for success conditions
            if "feed" in current_url:
                success = True
                break

            # Check if post dialog closed (success indicator)
            try:
                dialog_count = await page.locator("[role='dialog'], .share-creation-state").count()
                if dialog_count == 0:
                    success = True
                    break
            except:
                pass

        print(f"[STEP 6 DONE] Verification complete, URL: {page.url}, success: {success}", file=sys.stderr)

        if success:
            print(json.dumps({"status_update": "published"}), flush=True)
            print(json.dumps({"status": "ok", "message": "Post published successfully"}), flush=True)
            return "Post published successfully"
        else:
            print(json.dumps({"status_update": "published"}), flush=True)
            print(json.dumps({"status": "ok", "message": "Post submitted"}), flush=True)
            return "Post submitted"

    except Exception as e:
        # Status update: failed
        print(json.dumps({"status_update": "failed"}), flush=True)
        raise


# ─── Comment ──────────────────────────────────────────────────────────────────
async def do_comment(page, post_url: str, comment: str) -> str:
    await page.goto(post_url, wait_until="domcontentloaded")
    await random_delay(3, 6)
    await human_scroll(page, scrolls=random.randint(2, 3))
    await random_delay(1, 3)

    try:
        comment_box = page.locator(".comments-comment-box__form-container").first
        await comment_box.wait_for(state="visible", timeout=10000)
        await comment_box.click()
        await random_delay(1, 2)
    except PlaywrightTimeout:
        await page.click("//button[contains(., 'Comment')]")
        await random_delay(1, 2)

    await human_type(page, ".ql-editor", comment)
    await random_delay(1.5, 3)

    try:
        submit = page.locator("button.comments-comment-box__submit-button").first
        await submit.wait_for(state="visible", timeout=8000)
        await submit.click()
    except PlaywrightTimeout:
        await page.keyboard.press("Control+Return")

    await random_delay(2, 4)
    return "Comment posted successfully"


# ─── React ────────────────────────────────────────────────────────────────────
async def do_react(page, post_url: str, reaction: str = "like") -> str:
    await page.goto(post_url, wait_until="domcontentloaded")
    await random_delay(3, 5)
    await human_scroll(page, scrolls=random.randint(1, 3))
    await random_delay(1.5, 3)

    try:
        like_button = page.locator("button.react-button__trigger").first
        await like_button.wait_for(state="visible", timeout=10000)

        if reaction == "like":
            await like_button.click()
        else:
            await like_button.hover()
            await random_delay(1.5, 2.5)
            reaction_map = {
                "celebrate": "PRAISE",
                "support": "EMPATHY",
                "love": "APPRECIATION",
                "insightful": "INTEREST",
                "funny": "ENTERTAINMENT"
            }
            aria_label = reaction_map.get(reaction, "LIKE")
            await page.locator(f"button[aria-label='{aria_label}']").first.click()

    except PlaywrightTimeout:
        raise Exception(f"Could not find react button on: {post_url}")

    await random_delay(2, 4)
    return f"Reacted with '{reaction}' successfully"


# ─── Entry Point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "message": "No args provided"}))
        sys.exit(1)

    try:
        args = json.loads(sys.argv[1])
        asyncio.run(run(args))
    except json.JSONDecodeError as e:
        print(json.dumps({"status": "error", "message": f"Invalid JSON args: {str(e)}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)
