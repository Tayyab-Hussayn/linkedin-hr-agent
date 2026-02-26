"""
Humanizer utilities for LinkedIn automation.
Adds random delays, human-like typing, scrolling, and mouse movement to avoid detection.
"""

import asyncio
import random
import math


# ─── Delay ────────────────────────────────────────────────────────────────────

async def random_delay(min_seconds: float, max_seconds: float):
    """Sleep for a random duration between min and max seconds."""
    delay = random.uniform(min_seconds, max_seconds)
    await asyncio.sleep(delay)


# ─── Typing ───────────────────────────────────────────────────────────────────

async def human_type(page, selector: str, text: str):
    """
    Type text with human-like speed variance.
    - Random delay per keystroke (40-180ms)
    - Occasional longer pauses simulating thinking
    - Handles newlines correctly for LinkedIn's editor
    """
    element = page.locator(selector).first
    await element.click()
    await random_delay(0.3, 0.8)

    for i, char in enumerate(text):
        if char == '\n':
            # LinkedIn editor uses Shift+Enter for line breaks
            await page.keyboard.press("Shift+Enter")
            await random_delay(0.1, 0.3)
            continue

        await page.keyboard.type(char)

        # Base keystroke delay — varied like a real typist
        delay = random.uniform(0.04, 0.18)

        # Occasionally pause longer — simulating thinking or re-reading
        if random.random() < 0.04:  # 4% chance of thinking pause
            delay += random.uniform(0.4, 1.2)

        # Slightly longer after punctuation — natural rhythm
        if char in '.!?,;:':
            delay += random.uniform(0.1, 0.4)

        # Longer after end of sentence
        if char in '.!?' and i < len(text) - 1 and text[i + 1] == ' ':
            delay += random.uniform(0.2, 0.6)

        await asyncio.sleep(delay)

    # Small pause after finishing typing
    await random_delay(0.3, 0.8)


# ─── Scrolling ────────────────────────────────────────────────────────────────

async def human_scroll(page, scrolls: int = 3):
    """
    Scroll the page in a human-like pattern.
    - Variable scroll amounts per scroll event
    - Random pauses between scrolls
    - Occasionally scrolls back up slightly (like reading)
    - Uses smooth incremental scrolling
    """
    total_scrolls = scrolls
    scrolled_down = 0

    for i in range(total_scrolls):
        # Most scrolls go down, occasionally one goes back up
        going_up = random.random() < 0.15 and scrolled_down > 200

        if going_up:
            amount = random.randint(50, 150)
            await page.mouse.wheel(0, -amount)
            scrolled_down -= amount
        else:
            # Variable scroll distance — humans don't scroll exact amounts
            amount = random.randint(120, 450)

            # Simulate smooth scroll with multiple small events
            steps = random.randint(3, 7)
            step_amount = amount // steps
            for _ in range(steps):
                await page.mouse.wheel(0, step_amount)
                await asyncio.sleep(random.uniform(0.02, 0.06))

            scrolled_down += amount

        # Pause between scrolls — simulating reading
        await random_delay(0.6, 2.2)

        # Occasionally a longer pause — like stopped to read something
        if random.random() < 0.2:
            await random_delay(1.0, 3.0)


# ─── Mouse Movement ───────────────────────────────────────────────────────────

async def human_mouse_move(page, moves: int = None):
    """
    Move mouse in natural curved paths across the page.
    - Bezier curve simulation for realistic trajectories
    - Variable speed throughout movement
    - Random number of moves if not specified
    """
    if moves is None:
        moves = random.randint(2, 5)

    # Get viewport size
    viewport = page.viewport_size
    if not viewport:
        viewport = {"width": 1280, "height": 800}

    width = viewport["width"]
    height = viewport["height"]

    # Start from a random position
    current_x = random.randint(100, width - 100)
    current_y = random.randint(100, height - 100)

    # Initial move to starting position
    await page.mouse.move(current_x, current_y)
    await random_delay(0.1, 0.3)

    for _ in range(moves):
        # Random target position
        target_x = random.randint(100, width - 100)
        target_y = random.randint(100, height - 100)

        # Simulate curved path using intermediate points
        await _move_mouse_curved(page, current_x, current_y, target_x, target_y)

        current_x = target_x
        current_y = target_y

        # Pause at destination — like reading or hovering
        await random_delay(0.2, 0.8)


async def _move_mouse_curved(page, start_x: int, start_y: int, end_x: int, end_y: int):
    """
    Move mouse along a curved path using quadratic bezier interpolation.
    Mimics the natural arc human wrists make when moving a mouse.
    """
    # Control point for bezier curve — offset from midpoint
    mid_x = (start_x + end_x) / 2
    mid_y = (start_y + end_y) / 2
    control_x = mid_x + random.randint(-120, 120)
    control_y = mid_y + random.randint(-120, 120)

    # Number of steps — more steps = smoother curve
    steps = random.randint(15, 35)

    # Variable speed — accelerate then decelerate (ease-in-out)
    for step in range(steps + 1):
        t = step / steps

        # Ease-in-out: slow at start and end, fast in middle
        t_eased = t * t * (3 - 2 * t)

        # Quadratic bezier formula
        x = int((1 - t_eased) ** 2 * start_x +
                2 * (1 - t_eased) * t_eased * control_x +
                t_eased ** 2 * end_x)
        y = int((1 - t_eased) ** 2 * start_y +
                2 * (1 - t_eased) * t_eased * control_y +
                t_eased ** 2 * end_y)

        # Add tiny jitter — hand tremor simulation
        x += random.randint(-2, 2)
        y += random.randint(-2, 2)

        await page.mouse.move(x, y)

        # Variable step delay — faster in middle of movement
        speed_factor = 1 - abs(t - 0.5) * 1.5  # faster near t=0.5
        delay = random.uniform(0.008, 0.025) * (1 + speed_factor * 0.5)
        await asyncio.sleep(delay)


# ─── Click Helpers ────────────────────────────────────────────────────────────

async def human_click(page, selector: str):
    """
    Click an element with human-like behavior:
    - Move mouse to element first
    - Small pause before clicking
    - Slight position variance within element bounds
    """
    element = page.locator(selector).first
    box = await element.bounding_box()

    if box:
        # Click slightly off-center — humans don't click exact center
        x = box["x"] + box["width"] * random.uniform(0.3, 0.7)
        y = box["y"] + box["height"] * random.uniform(0.3, 0.7)

        # Move mouse to element
        await page.mouse.move(x, y)
        await random_delay(0.1, 0.4)

        # Click
        await page.mouse.click(x, y)
    else:
        # Fallback to standard click
        await element.click()

    await random_delay(0.2, 0.5)
