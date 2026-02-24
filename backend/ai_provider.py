# backend/ai_provider.py
import httpx
from typing import Optional
from config_loader import get_config


class AIProviderError(Exception):
    pass


class AIProvider:
    """
    Single interface for all AI providers.
    Swap provider in config.json — zero code changes.
    """

    def __init__(self):
        self.config = get_config()
        self.provider = self.config["ai"]["provider"]

    async def complete(
        self,
        prompt: str,
        system: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> str:
        if self.provider == "ollama":
            return await self._ollama(prompt, system, max_tokens, temperature)
        elif self.provider == "anthropic":
            return await self._anthropic(prompt, system, max_tokens, temperature)
        elif self.provider == "openai":
            return await self._openai(prompt, system, max_tokens, temperature)
        else:
            raise AIProviderError(f"Unknown provider: {self.provider}")

    async def _ollama(self, prompt, system, max_tokens, temperature) -> str:
        cfg = self.config["ai"]["ollama"]
        url = f"{cfg['base_url']}/api/chat"

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": cfg["model"],
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
                return data["message"]["content"].strip()
            except httpx.HTTPError as e:
                raise AIProviderError(f"Ollama request failed: {e}")

    async def _anthropic(self, prompt, system, max_tokens, temperature) -> str:
        cfg = self.config["ai"]["anthropic"]
        if not cfg.get("api_key"):
            raise AIProviderError("Anthropic API key not set")

        headers = {
            "x-api-key": cfg["api_key"],
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

        payload = {
            "model": cfg["model"],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            payload["system"] = system

        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
                return data["content"][0]["text"].strip()
            except httpx.HTTPError as e:
                raise AIProviderError(f"Anthropic request failed: {e}")

    async def _openai(self, prompt, system, max_tokens, temperature) -> str:
        cfg = self.config["ai"]["openai"]
        if not cfg.get("api_key"):
            raise AIProviderError("OpenAI API key not set")

        headers = {
            "Authorization": f"Bearer {cfg['api_key']}",
            "Content-Type": "application/json",
        }

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": cfg["model"],
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
                return data["choices"][0]["message"]["content"].strip()
            except httpx.HTTPError as e:
                raise AIProviderError(f"OpenAI request failed: {e}")


# Module-level instance
ai = AIProvider()
