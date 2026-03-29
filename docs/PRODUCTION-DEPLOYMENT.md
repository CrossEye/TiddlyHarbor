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

# OAuth (see section 4 below)
OAUTH_EXTERNAL_BASE_URL=https://wiki.example.com

# SMTP (see section 5 below)
```

### Edit `config/sites.yml`

Define your wikis:

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
    # oauth_providers: [github, google]

  policies:
    path: /policies
    domain: policies.rhamschools.org
    public_read: false
    repo: "https://TOKEN@github.com/org/policies-wiki.git"
```

### Generate Docker configs

```bash
npm run setup
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

By default, all wikis show all configured OAuth providers. To restrict:

```yaml
# In sites.yml
sites:
  main:
    oauth_providers: [github, google]  # both providers
  internal:
    oauth_providers: [google]          # Google only
```

---

## 5. Email Notifications (Optional)

TiddlyHarbor can email admins when a new user registers and is awaiting
approval. Configure SMTP in `.env`:

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
instead. No emails are sent.

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

---

## 7. Managing Wikis

### Add a wiki

```bash
npm run manage add my-wiki --domain=my-wiki.example.com
# or: npm run manage add my-wiki --path=/my-wiki
docker compose up -d --build
```

### Remove a wiki

```bash
npm run manage remove my-wiki
docker compose up -d --build
```

**Warning:** Removing a wiki from the config does not delete its data volume. To
fully remove data: `docker volume rm tiddlyharbor_wiki_mywiki_data`

### List wikis

```bash
npm run manage list
```

---

## 8. Backup with Git Push

Each wiki's tiddlers directory is a git repository. To push to GitHub:

1. Create a GitHub repository for the wiki
2. Generate a fine-grained personal access token with Contents write permission
3. Update `sites.yml`:

```yaml
sites:
  main:
    repo: "https://ghp_TOKEN@github.com/your-org/main-wiki.git"
    git_autopush: true
```

4. Regenerate and restart:

```bash
npm run setup
docker compose up -d --build
```

Auto-commits are pushed to GitHub after each save.

---

## 9. Updating

```bash
cd TiddlyHarbor
git pull
npm run setup          # regenerate configs if sites.yml format changed
docker compose up -d --build
```

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

- Verify the site is in `sites.yml` and configs are regenerated
- Check container is running: `docker compose ps`
- View container logs: `docker compose logs wiki-SITENAME`
