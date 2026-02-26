"""
Humanizer utilities for LinkedIn automation.
Adds random delays and human-like typing to avoid detection.
"""

import asyncio
import random


async def random_delay(min_seconds: float, max_seconds: float):
    """Sleep for a random duration between min and max seconds."""
    delay = random.uniform(min_seconds, max_seconds)
    await asyncio.sleep(delay)


async def human_type(page, selector: str, text: str):
    """Type text with human-like speed variance."""
    element = page.locator(selector).first
    await element.click()

    for char in text:
        await element.type(char)
        # Random delay between 40-120ms per keystroke
        delay = random.uniform(0.04, 0.12)
        await asyncio.sleep(delay)
