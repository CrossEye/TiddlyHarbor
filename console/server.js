'use strict';

const crypto = require('crypto');
const express = require('express');
const path = require('path');

const { loadConfig, addSite, updateSite, removeSite, parseFormToSiteConfig } = require('./lib/config');
const { getContainerStatus, applyConfig } = require('./lib/docker');
const { setBasePath, renderDashboard, renderAddForm, renderEditForm, renderRemoveConfirm, renderApplyResult } = require('./lib/pages');

// ─── Config ─────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3000;
const CONSOLE_USER = process.env.CONSOLE_USER || 'admin';
const CONSOLE_PASS = process.env.CONSOLE_PASS;
const SITES_PATH = process.env.SITES_PATH || '/app/config/sites.yml';
const HOST_PROJECT_DIR = process.env.HOST_PROJECT_DIR || '/app';
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');

setBasePath(BASE_PATH);

if (!CONSOLE_PASS) {
  console.error('CONSOLE_PASS environment variable is required.');
  process.exit(1);
}

// ─── App ────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.urlencoded({ extended: false }));

// ─── Basic Auth ─────────────────────────────────────────────────────────────

app.use((req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="TiddlyHarbor Console"');
    return res.status(401).send('Authentication required.');
  }

  const decoded = Buffer.from(header.slice(6), 'base64').toString();
  const colon = decoded.indexOf(':');
  if (colon < 0) {
    res.set('WWW-Authenticate', 'Basic realm="TiddlyHarbor Console"');
    return res.status(401).send('Authentication required.');
  }

  const user = decoded.slice(0, colon);
  const pass = decoded.slice(colon + 1);

  const userBuf = Buffer.from(user);
  const passBuf = Buffer.from(pass);
  const expectedUser = Buffer.from(CONSOLE_USER);
  const expectedPass = Buffer.from(CONSOLE_PASS);

  const userOk = userBuf.length === expectedUser.length &&
    crypto.timingSafeEqual(userBuf, expectedUser);
  const passOk = passBuf.length === expectedPass.length &&
    crypto.timingSafeEqual(passBuf, expectedPass);

  if (!userOk || !passOk) {
    res.set('WWW-Authenticate', 'Basic realm="TiddlyHarbor Console"');
    return res.status(401).send('Invalid credentials.');
  }

  next();
});

// ─── Routes ─────────────────────────────────────────────────────────────────

// Dashboard
app.get('/', async (req, res) => {
  try {
    const config = loadConfig(SITES_PATH);
    const containerStatus = await getContainerStatus();
    const flash = req.query.msg
      ? { message: req.query.msg, type: req.query.type || 'success' }
      : null;
    res.send(renderDashboard(config.sites, containerStatus, flash));
  } catch (err) {
    res.status(500).send(`Error loading config: ${err.message}`);
  }
});

// Add wiki — form
app.get('/wikis/add', (req, res) => {
  try {
    const config = loadConfig(SITES_PATH);
    res.send(renderAddForm(config.defaults, null, {}));
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

// Add wiki — submit
app.post('/wikis/add', (req, res) => {
  try {
    const name = (req.body.name || '').trim().toLowerCase();
    const siteConfig = parseFormToSiteConfig(req.body);
    const result = addSite(SITES_PATH, name, siteConfig);

    if (!result.ok) {
      const config = loadConfig(SITES_PATH);
      return res.send(renderAddForm(config.defaults, result.error, { name, ...siteConfig }));
    }

    res.redirect(`${BASE_PATH}/?msg=${encodeURIComponent(`Wiki "${name}" added.`)}&type=success`);
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

// Edit wiki — form
app.get('/wikis/:name/edit', (req, res) => {
  try {
    const config = loadConfig(SITES_PATH);
    const name = req.params.name;
    const site = config.sites[name];

    if (!site) {
      return res.redirect(`${BASE_PATH}/?msg=${encodeURIComponent(`Wiki "${name}" not found.`)}&type=error`);
    }

    res.send(renderEditForm(name, site, config.defaults, null));
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

// Edit wiki — submit
app.post('/wikis/:name/edit', (req, res) => {
  try {
    const name = req.params.name;
    const siteConfig = parseFormToSiteConfig(req.body);
    const result = updateSite(SITES_PATH, name, siteConfig);

    if (!result.ok) {
      const config = loadConfig(SITES_PATH);
      const site = config.sites[name] || {};
      return res.send(renderEditForm(name, { ...site, ...siteConfig }, config.defaults, result.error));
    }

    res.redirect(`${BASE_PATH}/?msg=${encodeURIComponent(`Wiki "${name}" updated.`)}&type=success`);
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

// Remove wiki — confirm or execute
app.post('/wikis/:name/remove', (req, res) => {
  try {
    const name = req.params.name;
    const config = loadConfig(SITES_PATH);
    const site = config.sites[name];

    if (!site) {
      return res.redirect(`${BASE_PATH}/?msg=${encodeURIComponent(`Wiki "${name}" not found.`)}&type=error`);
    }

    // First POST shows confirmation; second POST (with confirm=yes) executes
    if (req.body.confirm !== 'yes') {
      const siteCount = Object.keys(config.sites).length;
      return res.send(renderRemoveConfirm(name, site, siteCount));
    }

    const result = removeSite(SITES_PATH, name);
    if (!result.ok) {
      return res.redirect(`${BASE_PATH}/?msg=${encodeURIComponent(result.error)}&type=error`);
    }

    res.redirect(`${BASE_PATH}/?msg=${encodeURIComponent(`Wiki "${name}" removed.`)}&type=success`);
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

// Apply changes — regenerate configs and docker compose up
app.post('/apply', async (req, res) => {
  try {
    const result = await applyConfig(HOST_PROJECT_DIR);
    res.send(renderApplyResult(result.success, result.stdout, result.stderr));
  } catch (err) {
    res.send(renderApplyResult(false, '', err.message));
  }
});

// ─── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`TiddlyHarbor Console listening on port ${PORT}`);
});
