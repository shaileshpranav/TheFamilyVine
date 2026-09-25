from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.config import Settings, get_settings
from app.routers import events, invites, me, people, subtrees, trees


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title=f"{settings.app_name} API", version="0.1.0")

    if not settings.testing:
        from supertokens_python import get_all_cors_headers
        from supertokens_python.framework.fastapi import get_middleware

        from app.auth import init_supertokens

        init_supertokens(settings)
        app.add_middleware(get_middleware())
        if settings.cors_origins:
            app.add_middleware(
                CORSMiddleware,
                allow_origins=settings.cors_origins,
                allow_credentials=True,
                allow_methods=["*"],
                allow_headers=["Content-Type", *get_all_cors_headers()],
            )

    @app.get("/api/health", tags=["meta"])
    async def health():
        return {"status": "ok"}

    @app.get("/", include_in_schema=False)
    async def root():
        # This port only serves the API; send stray browser visits to the web app.
        return RedirectResponse(settings.website_domain)

    for module in (me, trees, invites, subtrees, people, events):
        app.include_router(module.router)
    return app


app = create_app()
