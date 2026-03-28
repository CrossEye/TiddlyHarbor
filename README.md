TiddlyHarbor
============

Phase 1.5 scaffold for a self-hosted TiddlyWiki platform with:
- Caddy reverse proxy
- Express wrapper in front of TiddlyWiki
- Writer login guard for write operations
- Write-triggered git auto-save with quiescence and max-interval timers
- Multi-site generation from config/sites.yml

## Quick Start

1. Copy environment file:

	 ```bash
	 cp .env.example .env
	 ```

	 On Windows cmd:

	 ```cmd
	 copy .env.example .env
	 ```

2. Update credentials in .env.

3. Generate routing and compose files from config:

	 ```bash
	 node scripts/generate-config.js
	 ```

	 On Windows cmd:

	 ```cmd
	 setup.cmd
	 ```

	 On Windows PowerShell (if npm script execution is restricted):

	 ```powershell
	 node scripts/generate-config.js
	 ```

4. Start the stack:

	 ```bash
	 docker compose up --build
	 ```

5. Open:
	 - Main wiki: http://localhost/main/
	 - Sandbox wiki: http://localhost/sandbox/
	 - Main health endpoint: http://localhost/main/health

## Current Behavior

- Reads are public.
- Anonymous visitors are reported to TiddlyWiki as read-only, so edit/create controls are hidden by the client.
- TiddlyWiki write operations (PUT/DELETE under /recipes/*) require writer login.
- Writer accounts are stored in a local SQLite database at `/app/wiki/.tiddlyharbor/auth.sqlite3` by default.
- On first startup for each wiki, a bootstrap writer account is created from that wiki's `BASIC_AUTH_USER/BASIC_AUTH_PASS` values.
- Writer login is available at `/main/login` and `/sandbox/login` and sets an HTTP-only cookie for subsequent write requests.
- Writer login supports safe return paths via `?next=/main/...` or `?next=/sandbox/...`.
- The built-in TiddlyWiki login/logout actions also use the same cookie-backed writer session.
- Auto-save marks a wiki dirty on successful write requests and commits on:
	- Quiescence timer (default 5 minutes)
	- Max interval timer (default 60 minutes)

## Writer Access

1. Open `/main/login` or `/sandbox/login`
2. Sign in with the matching credentials from `.env`
3. Return to the wiki and save normally, or use the TiddlyWiki login/logout controls in the page chrome

Writers can inspect login state at `/main/auth/status` or `/sandbox/auth/status`.
Status payloads include `username` when authenticated.

## User Admin CLI

Run user-management commands inside the target wiki container:

```cmd
docker compose exec wiki-main node scripts/user-admin.js list
docker compose exec wiki-main node scripts/user-admin.js create alice StrongPassword123 writer
docker compose exec wiki-main node scripts/user-admin.js set-password alice EvenStrongerPassword456
docker compose exec wiki-main node scripts/user-admin.js set-role alice admin
docker compose exec wiki-main node scripts/user-admin.js disable alice
docker compose exec wiki-main node scripts/user-admin.js enable alice
docker compose exec wiki-main node scripts/user-admin.js delete alice
```

Supported roles are `reader`, `writer`, and `admin`.

## Project Layout

```
TW_Hosting/
	config/
		sites.yml
	scripts/
		generate-config.js
	Caddyfile               # generated
	docker-compose.yml      # generated
	.env.example
	setup.cmd
	wiki-container/
		Dockerfile
		package.json
		server.js
		lib/
			tw-process.js
			write-guard.js
			git-sync.js
```

## Regenerating Config

1. Edit config/sites.yml
2. Run node scripts/generate-config.js
3. Restart docker compose

## What Comes Next

Planned next steps from your full plan:
- OAuth via Passport.js
- User roles in SQLite
- Semantic version tagging and static history views
