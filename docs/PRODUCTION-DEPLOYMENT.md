<p align="center">
  <img src="../wiki-container/logos/wordmark-dark-bg.svg" alt="TiddlyHarbor" width="480">
</p>

# Production Deployment Guide

This guide covers deploying TiddlyHarbor to a VPS with real domains, HTTPS,
OAuth, and email notifications.

---

## 1. Prerequisites

- A VPS (Hetzner CX22 ~$6/mo, DigitalOcean $8/mo, or similar)
- A domain name with DNS access
- SSH access to the server
- Docker and Docker Compose installed on the server

### Install Docker (Ubuntu/Debian)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group change to take effect
```

### Firewall

Allow ports 80 (HTTP) and 443 (HTTPS):

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 2. DNS Configuration

Point your domain to the server's IP address.

**For path-based routing** (all wikis on one domain):

```
A   wiki.example.com   →   YOUR_SERVER_IP
```

**For subdomain routing** (each wiki on its own subdomain):

```
A   wiki.example.com       →   YOUR_SERVER_IP
A   *.wiki.example.com     →   YOUR_SERVER_IP
```

Or add individual A records per wiki:

```
A   chess.example.com      →   YOUR_SERVER_IP
A   policies.example.com   →   YOUR_SERVER_IP
```

**Custom domains** (CNAME from another domain to yours):

```
CNAME   policies.rhamschools.org   →   wiki.example.com
```

DNS changes can take up to 48 hours to propagate, but usually complete within
minutes.

---

## 3. Clone and Configure

```bash
git clone https://github.com/CrossEye/TiddlyHarbor.git
cd TiddlyHarbor
cp .env.example .env
```

### Edit `.env`

Fill in credentials for each wiki and shared services:

```bash
# Per-wiki bootstrap admin credentials
MAIN_BASIC_AUTH_USER=admin
MAIN_BASIC_AUTH_PASS=your-secure-password-here

# Session secret (generate with: openssl rand -hex 32)
WRITER_SESSION_SECRET=generate-a-random-string-here

# Git author for auto-commits
GIT_AUTHOR_NAME=TiddlyHarbor Bot
GIT_AUTHOR_EMAIL=bot@example.com

# Management console credentials
CONSOLE_USER=admin
CONSOLE_PASS=your-console-password-here
HOST_PROJECT_DIR=/path/to/TiddlyHarbor

# OAuth (see section 4 below)
OAUTH_EXTERNAL_BASE_URL=https://wiki.example.com

# SMTP (see section 5 below)
```

### Edit `config/sites.yml`

Define your initial wikis (you can also add wikis later through the console):

```yaml
defaults:
  quiescence_minutes: 5
  max_commit_interval_minutes: 60
  public_read: true
  git_autosave_enabled: true
  git_autopush: false

sites:
  main:
    path: /main
    domain: wiki.example.com
    repo: ""
```

### Generate Docker configs

```bash
node scripts/generate-config.js
```

This creates `docker-compose.yml` and `Caddyfile` from your `sites.yml`.

---

## 4. OAuth Setup

OAuth requires `OAUTH_EXTERNAL_BASE_URL` to be set to your public URL (e.g.,
`https://wiki.example.com`). If empty, OAuth is disabled and only password login
is available.

### GitHub

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Set **Homepage URL** to `https://wiki.example.com`
4. Set **Authorization callback URL** to
   `https://wiki.example.com/main/auth/github/callback`
5. For each additional wiki, add its callback URL (GitHub allows only one, so
   use the primary wiki and rely on shared credentials)

Add to `.env`:

```
OAUTH_GITHUB_CLIENT_ID=your-client-id
OAUTH_GITHUB_CLIENT_SECRET=your-client-secret
```

**Note:** GitHub OAuth apps allow only one callback URL. Since all wikis share
the same OAuth app, you may need to register the callback for each wiki path.
Alternatively, consider using a GitHub App (which supports multiple callback
URLs).

### Google

1. Go to https://console.cloud.google.com/apis/credentials
2. Create a project (or select existing)
3. Click "Create Credentials" > "OAuth 2.0 Client ID"
4. Set application type to "Web application"
5. Add **Authorized redirect URIs** for each wiki:
   - `https://wiki.example.com/main/auth/google/callback`
   - `https://wiki.example.com/policies/auth/google/callback`
   - (one per wiki — Google requires exact matches, no wildcards)
6. Configure the OAuth consent screen (External, add your domain)

Add to `.env`:

```
OAUTH_GOOGLE_CLIENT_ID=your-client-id
OAUTH_GOOGLE_CLIENT_SECRET=your-client-secret
```

### Per-Wiki Provider Selection

By default, all wikis show all configured OAuth providers. To restrict
providers for specific wikis, set `oauth_providers` in the wiki's config
(either through the console edit form or in `sites.yml`):

```yaml
sites:
  main:
    oauth_providers: [github, google]  # both providers
  internal:
    oauth_providers: [google]          # Google only
```

---

## 5. Email Setup (Optional)

TiddlyHarbor uses SMTP email for:

- **User invites** — Admins can create users with just an email; the user
  receives a link to set their password
- **Password resets** — Users can request a forgot-password link from the
  login page
- **Admin notifications** — Emails when new OAuth users register and are
  awaiting approval

Configure SMTP in `.env`:

```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.your-sendgrid-api-key
SMTP_FROM=noreply@example.com
```

**Alternative providers:**

| Provider | SMTP Host | Port | Notes |
|----------|-----------|------|-------|
| SendGrid | smtp.sendgrid.net | 587 | Free tier: 100 emails/day |
| Gmail | smtp.gmail.com | 587 | Use App Password (not regular password) |
| Mailgun | smtp.mailgun.org | 587 | Free tier: 5,000 emails/month |
| Amazon SES | email-smtp.us-east-1.amazonaws.com | 587 | Very cheap at scale |

If SMTP is not configured, TiddlyHarbor logs notifications to the console
instead. Invite and password-reset features are unavailable without SMTP —
users must be created with passwords directly.

**Note:** Some VPS providers (notably Oracle Cloud) block outbound SMTP on port
25. Port 587 (submission) is usually open.

---

## 6. Launch

```bash
docker compose up -d --build
```

Visit your domain — Caddy automatically provisions HTTPS certificates via Let's
Encrypt.

Check logs:

```bash
docker compose logs -f
```

The management console is available at `https://wiki.example.com/_console/`.

---

## 7. Managing Wikis

### Using the Console

The management console at `/_console/` is the primary way to manage wikis.

**Adding a wiki:**

1. Click **Add Wiki** on the dashboard
2. Fill in the wiki name, path, and optional settings (domain, git repo,
   branch, auth credentials, OAuth providers)
3. Optionally upload an HTML TiddlyWiki file to import its tiddlers
4. Submit — the config is saved and applied automatically

**Editing a wiki:**

1. Click the **Edit** link next to any wiki on the dashboard
2. Modify fields as needed
3. Submit — changes are applied automatically

**Removing a wiki:**

1. Click the **Remove** link next to a wiki
2. Confirm removal; optionally check "delete data volume" for permanent deletion
3. The config is updated and applied automatically

**Applying changes manually:**

If you edit `config/sites.yml` directly, click **Apply Changes** on the
dashboard to regenerate configs and restart containers. The button shows
"Up to date" when the running config matches what was last applied.

### Using the Per-Wiki Admin Page

Each wiki has an admin page at `/<wiki>/admin` for managing that wiki's users:

- **Create users** — With a password, or with just an email to send an invite
  link (requires SMTP)
- **Manage roles** — Assign `reader`, `writer`, or `admin`
- **Set emails** — Inline email field per user
- **Reset passwords** — Set a new password for any user
- **Enable/disable accounts** — Temporarily suspend access
- **Delete users** — Permanently remove an account

The login page shows a **Forgot password?** link when SMTP is configured,
allowing users to reset their own passwords via email.

---

## 8. Backup with Git Push

Each wiki's tiddlers directory is a git repository. To push to a remote:

1. Create a GitHub repository for the wiki
2. Generate a fine-grained personal access token with Contents write permission
3. Set the repo URL in the console's edit form for the wiki (or in `sites.yml`):

   ```yaml
   sites:
     main:
       repo: "https://ghp_TOKEN@github.com/your-org/main-wiki.git"
       git_autopush: true
       git_branch: main
   ```

4. If editing `sites.yml` directly, click **Apply Changes** in the console

Auto-commits are pushed to the remote after each save cycle.

Wikis with a `repo` configured will clone from that remote on first start if the
wiki directory is empty. Set `git_branch` to specify which branch to use.

---

## 9. Updating

```bash
cd TiddlyHarbor
git pull
docker compose up -d --build
```

If the `sites.yml` schema has changed, regenerate configs first:

```bash
node scripts/generate-config.js
docker compose up -d --build
```

Or use the console's **Apply Changes** button after pulling.

---

## 10. Troubleshooting

### Caddy won't start / TLS errors

- Ensure ports 80 and 443 are open and not used by another service
- Check DNS propagation: `dig +short wiki.example.com`
- View Caddy logs: `docker compose logs caddy`

### OAuth callback mismatch

- Ensure the callback URL registered with the provider exactly matches:
  `https://YOUR_DOMAIN/WIKI_NAME/auth/PROVIDER/callback`
- Check `OAUTH_EXTERNAL_BASE_URL` matches your actual domain (including
  `https://`)

### SMTP connection refused

- Verify your VPS allows outbound connections on port 587
- Test with: `docker compose exec wiki-main sh -c "nc -zv smtp.sendgrid.net 587"`
- Check credentials in `.env`

### Wiki not accessible

- Check the dashboard at `/_console/` — is the wiki's container running?
- View container logs: `docker compose logs wiki-SITENAME`
- Verify the site appears in `config/sites.yml`

### Console not accessible

- Ensure `CONSOLE_PASS` is set in `.env` (the console won't start without it)
- Ensure `HOST_PROJECT_DIR` is set to the absolute path of the TiddlyHarbor
  directory on the host
- Check console logs: `docker compose logs console`

---

## Power Users

### Site Management CLI

As an alternative to the console, the `manage-sites.js` script provides
command-line wiki management:

```bash
# List configured wikis
npm run manage list

# Add a wiki
npm run manage add my-wiki --domain=my-wiki.example.com
npm run manage add my-wiki --path=/my-wiki --repo=https://TOKEN@github.com/org/repo.git

# Remove a wiki
npm run manage remove my-wiki
```

After CLI changes, regenerate and restart:

```bash
node scripts/generate-config.js
docker compose up -d --build
```

### User Admin CLI

Run user commands inside a wiki container:

```bash
docker compose exec wiki-main node scripts/user-admin.js list
docker compose exec wiki-main node scripts/user-admin.js create alice StrongPass123 writer
docker compose exec wiki-main node scripts/user-admin.js set-password alice NewPass456
docker compose exec wiki-main node scripts/user-admin.js set-role alice admin
docker compose exec wiki-main node scripts/user-admin.js disable alice
docker compose exec wiki-main node scripts/user-admin.js enable alice
docker compose exec wiki-main node scripts/user-admin.js delete alice
```

### Admin REST API

Authenticated `admin` sessions can manage users via HTTP:

```bash
# List users
curl -s -b cookie.txt http://localhost/main/auth/users

# Create user
curl -s -b cookie.txt -X POST http://localhost/main/auth/users \
  -H "Content-Type: application/json" \
  -d '{"username":"bob","password":"StrongPass123","role":"writer"}'

# Change role
curl -s -b cookie.txt -X PATCH http://localhost/main/auth/users/bob/role \
  -H "Content-Type: application/json" -d '{"role":"admin"}'

# Toggle active
curl -s -b cookie.txt -X PATCH http://localhost/main/auth/users/bob/active \
  -H "Content-Type: application/json" -d '{"isActive":false}'

# Reset password
curl -s -b cookie.txt -X PATCH http://localhost/main/auth/users/bob/password \
  -H "Content-Type: application/json" -d '{"password":"NewPass456"}'

# Delete user
curl -s -b cookie.txt -X DELETE http://localhost/main/auth/users/bob
```
