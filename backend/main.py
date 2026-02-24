# backend/main.py
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config_loader import get_config, ConfigValidationError

# Boot-time config validation — fail loud and early
try:
    config = get_config()
except ConfigValidationError as e:
    print(f"\n❌ CONFIG ERROR: {e}\n")
    raise SystemExit(1)

app = FastAPI(
    title=config["app"]["name"],
    version=config["app"]["version"],
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "app": config["app"]["name"],
        "version": config["app"]["version"],
        "environment": config["app"]["environment"],
        "ai_provider": config["ai"]["provider"],
        "content_mode": config["content_mode"],
    }


@app.get("/health/ai")
async def health_ai():
    from ai_provider import ai
    try:
        response = await ai.complete(
            prompt="Reply with exactly: pong",
            system="You are a test assistant.",
            max_tokens=10,
        )
        return {"status": "ok", "provider": ai.provider, "response": response}
    except Exception as e:
        return {"status": "error", "provider": ai.provider, "error": str(e)}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
