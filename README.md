# TheFamilyVine

A self-hosted, multi-user family tree. The backend is FastAPI and Postgres, the web front end is React, and SuperTokens handles sign-in. The API is kept separate from the front end so a mobile app can use it later.

See [docs/PLAN.md](docs/PLAN.md) for the roadmap, roles and data model.

## Requirements

- Docker Desktop (runs Postgres and the SuperTokens core)
- [uv](https://docs.astral.sh/uv/) (Python 3.13 is installed automatically)
- Node 20+

## Running

From the repository root:

```bash
./dev.sh
```

This starts Docker Desktop if needed, brings up Postgres (:5432) and SuperTokens (:3567), applies database migrations, installs web dependencies on the first run, and then starts the API (:8000) and the web app (:5173). Press Ctrl+C to stop the API and web app. The databases keep running; stop them with `docker compose stop`.

Open http://localhost:5173, sign up, and create a tree. Passwords need at least 8 characters, including a number. The Vite dev server proxies `/api` to the backend, so both run on one origin and session cookies work without CORS setup. Interactive API docs are at http://localhost:8000/docs.

If sign-up or any page fails with "Something went wrong", the API probably isn't running. Check that `./dev.sh` is still running in a terminal.

To run the pieces by hand instead, use `docker compose up -d`, then `cd backend && uv run alembic upgrade head && uv run uvicorn app.main:app --reload --port 8000`, and in another terminal `cd frontend && npm install && npm run dev`.

## Preview mode (development only)

Add `?preview` to any URL, for example http://localhost:5173/trees/hollis?preview, to see the app filled with a sample family (the Hollis family from the design) without signing in. Use `?preview=contributor` or `?preview=personal` to see another role's view, and `?preview=off` to go back. Nothing is saved in preview mode, and none of it is included in production builds. The sample data lives in `frontend/src/dev/`.

## Everyday commands

| Task | Command |
|---|---|
| Backend tests | `cd backend && uv run pytest` |
| Lint / format (Python) | `cd backend && uv run ruff check . && uv run ruff format .` |
| New migration after model changes | `cd backend && uv run alembic revision --autogenerate -m "..."` then `uv run alembic upgrade head` |
| Regenerate typed API client after API changes | `cd frontend && npm run gen:api` |
| Type-check / lint / build (web) | `cd frontend && npx tsc -b && npm run lint && npm run build` |

## Layout

```
backend/
  app/
    main.py          app factory; SuperTokens middleware
    auth.py          SuperTokens setup; maps sign-ins to local users
    permissions.py   the single source of truth for who can do what
    subtrees.py      family-graph walks that resolve branch membership
    relations.py     "add parent/child/partner" family wiring
    models/          SQLAlchemy models
    routers/         me, trees (+members), invites, subtrees, people
  migrations/        Alembic
  tests/             pytest (runs on in-memory SQLite, no Docker needed)
frontend/
  src/api/           generated OpenAPI types, client, react-query hooks
  src/pages/         screens
  src/components/    shared UI (app shell, cards, form pieces)
  src/lib/           small helpers (formatting)
  src/dev/           preview-mode sample data and fake API (development only)
  src/index.css      design tokens and component styles
docker-compose.yml   Postgres + SuperTokens core
```
