"""
Single entry point for all LinkedIn browser actions.
Called by n8n Execute Command node with JSON args.

Usage:
  python linkedin_actions.py '{"action": "post", "content": "Hello world", "email": "x@y.com", "password": "pass"}'
  python linkedin_actions.py '{"action": "comment", "post_url": "...", "comment": "...", "email": "...", "password": "..."}'
  python linkedin_actions.py '{"action": "react", "post_url": "...", "reaction": "like", "email": "...", "password": "..."}'
"""

import sys
import json
import asyncio
from pathlib import Path
from humanizer import random_delay, human_type
from playwright.async_api import async_playwright


async def run(args: dict):
    action = args.get("action")
    email = args["email"]
    password = args["password"]

    # Create profiles directory if it doesn't exist
    profiles_dir = Path(__file__).parent / "profiles"
    profiles_dir.mkdir(exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch_persistent_context(
            user_data_dir=str(profiles_dir / email),
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
            viewport={"width": 1280, "height": 800},
        )
        page = browser.pages[0] if browser.pages else await browser.new_page()

        # Login if needed
        await ensure_logged_in(page, email, password)

        if action == "post":
            await do_post(page, args["content"])
        elif action == "comment":
            await do_comment(page, args["post_url"], args["comment"])
        elif action == "react":
            await do_react(page, args["post_url"], args.get("reaction", "like"))
        else:
            raise ValueError(f"Unknown action: {action}")

        await browser.close()

    print(json.dumps({"status": "ok", "action": action}))


async def ensure_logged_in(page, email, password):
    await page.goto("https://www.linkedin.com/feed/")
    await random_delay(2, 4)

    if "login" in page.url or "authwall" in page.url:
        await page.goto("https://www.linkedin.com/login")
        await random_delay(1, 3)
        await human_type(page, "#username", email)
        await random_delay(0.5, 1.5)
        await human_type(page, "#password", password)
        await random_delay(0.5, 1)
        await page.click('[type="submit"]')
        await random_delay(3, 6)


async def do_post(page, content: str):
    await page.goto("https://www.linkedin.com/feed/")
    await random_delay(2, 4)

    # Click the post start button
    start_button = page.locator("button.share-box-feed-entry__trigger").first
    await start_button.click()
    await random_delay(1, 3)

    # Type content
    editor = page.locator(".ql-editor").first
    await editor.click()
    await human_type(page, ".ql-editor", content)
    await random_delay(2, 4)

    # Click post button
    post_button = page.locator("button.share-actions__primary-action").first
    await post_button.click()
    await random_delay(3, 5)


async def do_comment(page, post_url: str, comment: str):
    await page.goto(post_url)
    await random_delay(3, 6)

    comment_box = page.locator(".comments-comment-box__form-container").first
    await comment_box.click()
    await random_delay(1, 2)

    await human_type(page, ".ql-editor", comment)
    await random_delay(1, 3)

    submit = page.locator("button.comments-comment-box__submit-button").first
    await submit.click()
    await random_delay(2, 4)


async def do_react(page, post_url: str, reaction: str = "like"):
    await page.goto(post_url)
    await random_delay(3, 6)

    like_button = page.locator("button.react-button__trigger").first
    await like_button.click()
    await random_delay(2, 4)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "message": "No args provided"}))
        sys.exit(1)

    try:
        args = json.loads(sys.argv[1])
        asyncio.run(run(args))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)
