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
	 npm run setup
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
- TiddlyWiki write operations (PUT/DELETE under /recipes/*) require writer login.
- Writer login is available at `/main/login` and `/sandbox/login` and sets an HTTP-only cookie for subsequent write requests.
- Auto-save marks a wiki dirty on successful write requests and commits on:
	- Quiescence timer (default 5 minutes)
	- Max interval timer (default 60 minutes)

## Writer Access

1. Open `/main/login` or `/sandbox/login`
2. Sign in with the matching credentials from `.env`
3. Return to the wiki and save normally

Writers can inspect login state at `/main/auth/status` or `/sandbox/auth/status`.

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
2. Run npm run setup
3. Restart docker compose

## What Comes Next

Planned next steps from your full plan:
- OAuth via Passport.js
- User roles in SQLite
- Semantic version tagging and static history views
