# Deploying to your own server (Coolify + Tailscale Funnel)

This runs the whole stack (Postgres, SuperTokens, the FastAPI backend, and the
React frontend behind nginx) as one Docker Compose project per environment,
managed by Coolify, and exposed to the internet through Tailscale Funnel —
no domain purchase, no router port forwarding.

Two Coolify resources track two branches: `production` and `dev`.

## 0. One-time server setup

Install Tailscale and join it to your tailnet:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Note the machine's name: `tailscale status` shows it, or find it at
https://login.tailscale.com/admin/machines. Its full hostname is
`<machine-name>.<tailnet-name>.ts.net` — that's what `PUBLIC_URL` uses below.

Install Coolify:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Finish setup at `http://<server-ip>:8000`.

## 1. Add the two Coolify resources

In Coolify, add this GitHub repo as a **Docker Compose** resource, twice:

- One tracking the `production` branch, compose file path `docker-compose.prod.yml`
- One tracking the `dev` branch, same compose file path

For **both**, leave the domain/FQDN field blank — Coolify's own proxy isn't
used here. Exposure is handled by the `web` service's `ports:` mapping in the
compose file plus Tailscale Funnel (step 3), so there's nothing for Coolify's
Traefik to do for this app.

Enable "Auto Deploy" on push for each, pointed at its branch.

## 2. Set environment variables

Copy [.env.production.example](../.env.production.example) as a reference and
set these in each resource's Coolify environment variable UI (never commit
real values):

| Variable | production | dev |
|---|---|---|
| `POSTGRES_USER` | `familytree` | `familytree` |
| `POSTGRES_PASSWORD` | a strong random value | a different strong random value |
| `WEB_PORT` | `8081` | `8082` |
| `PUBLIC_URL` | `https://<machine-name>.<tailnet-name>.ts.net` | `http://<machine-name>.<tailnet-name>.ts.net:8082` |

Deploy both resources once these are set.

## 3. Publish production via Tailscale Funnel

On the server, forward the funnel's public HTTPS traffic to the `web`
service's host port:

```bash
sudo tailscale funnel --bg 8081
```

Production is now reachable at `https://<machine-name>.<tailnet-name>.ts.net`
from anywhere, with Tailscale handling the TLS certificate automatically.

Dev is intentionally **not** funneled — it's only reachable over your
tailnet, at `http://<machine-name>.<tailnet-name>.ts.net:8082`, which is
enough for testing a deploy yourself before promoting `dev` → `production`.

To stop publishing production later: `sudo tailscale funnel --bg 8081 off`.

## 4. Verify

- `curl https://<machine-name>.<tailnet-name>.ts.net/api/health` → `{"status":"ok"}`
- Open the URL in a browser, sign up, create a tree, confirm it persists after a refresh.

## Promoting dev → production

Test changes on `dev` first (reachable only over your tailnet), then:

```bash
git checkout production
git merge dev
git push origin production
```

Coolify redeploys `production` automatically.

## How the stack starts

On every deploy, `db` starts first. Then `db-init` creates SuperTokens' `supertokens`
database if it doesn't exist yet, and exits. SuperTokens waits for `db-init` to
finish, and the backend applies database migrations before it starts serving.
Coolify doesn't count `db-init` towards the resource's health, because it's
marked `exclude_from_hc: true`.

`exclude_from_hc` is a Coolify extension, so plain `docker compose` rejects this
file as it stands. To try the production stack locally, run a copy without that
line:

```bash
grep -v exclude_from_hc docker-compose.prod.yml > /tmp/prod.yml
POSTGRES_PASSWORD=local PUBLIC_URL=http://localhost:8081 WEB_PORT=8081 \
  docker compose -p thefamilyvine-prod -f /tmp/prod.yml --project-directory . up --build
```
