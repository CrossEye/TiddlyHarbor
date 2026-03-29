const fs = require('fs');
const path = require('path');
const { simpleGit } = require('simple-git');

const SEMVER_TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/;

function parseSemver(tag) {
  const m = SEMVER_TAG_RE.exec(tag);
  if (!m) {
    return null;
  }
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function compareSemverDesc(a, b) {
  if (a.major !== b.major) return b.major - a.major;
  if (a.minor !== b.minor) return b.minor - a.minor;
  return b.patch - a.patch;
}

function bumpSemver(current, type) {
  const [major, minor, patch] = current.split('.').map(Number);
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

class GitSync {
  constructor(repoPath, options = {}) {
    this.repoPath = repoPath;
    this.enabled = options.enabled !== false;
    this.autoPush = options.autoPush === true;
    this.quiescenceMs = options.quiescenceMs ?? 5 * 60 * 1000;
    this.maxIntervalMs = options.maxIntervalMs ?? 60 * 60 * 1000;
    this.remoteUrl = options.remoteUrl || '';
    this.wikiName = options.wikiName || 'wiki';

    this.dirty = false;
    this.quiescenceTimer = null;
    this.maxTimer = null;
    this.initialized = false;
    this.committing = false;
    this.cachedVersion = '0.0.0';
    this.onCommit = options.onCommit || null;

    this.git = simpleGit({ baseDir: this.repoPath });
  }

  async initialize() {
    if (!this.enabled || this.initialized) {
      return;
    }

    fs.mkdirSync(this.repoPath, { recursive: true });

    const dotGitPath = path.join(this.repoPath, '.git');
    if (!fs.existsSync(dotGitPath)) {
      await this.git.init();
    }

    await this.git.addConfig('user.name', process.env.GIT_AUTHOR_NAME || 'TiddlyHarbor Bot');
    await this.git.addConfig('user.email', process.env.GIT_AUTHOR_EMAIL || 'tiddlyharbor@example.local');

    if (this.remoteUrl) {
      const remotes = await this.git.getRemotes(true);
      const origin = remotes.find((remote) => remote.name === 'origin');
      if (!origin) {
        await this.git.addRemote('origin', this.remoteUrl);
      }
    }

    this.initialized = true;

    await this.refreshCachedVersion();
  }

  markDirty() {
    if (!this.enabled) {
      return;
    }

    this.dirty = true;

    if (this.quiescenceTimer) {
      clearTimeout(this.quiescenceTimer);
    }

    this.quiescenceTimer = setTimeout(() => {
      this.commit('quiescence').catch((err) => {
        console.error('GitSync quiescence commit failed:', err.message);
      });
    }, this.quiescenceMs);

    if (!this.maxTimer) {
      this.maxTimer = setTimeout(() => {
        this.commit('interval').catch((err) => {
          console.error('GitSync interval commit failed:', err.message);
        });
      }, this.maxIntervalMs);
    }
  }

  async commit(reason) {
    if (!this.enabled || !this.dirty || this.committing) {
      return;
    }

    this.committing = true;

    try {
      await this.initialize();

      const status = await this.git.status();
      if (status.isClean()) {
        this.dirty = false;
        return;
      }

      await this.git.add('.');
      await this.git.commit(`Auto-save (${reason}) [${this.wikiName}] ${new Date().toISOString()}`);

      if (this.autoPush && this.remoteUrl) {
        await this.git.push('origin');
      }

      this.dirty = false;

      if (this.onCommit) {
        try { this.onCommit(); } catch (_) { /* best-effort */ }
      }
    } finally {
      this.committing = false;

      if (this.quiescenceTimer) {
        clearTimeout(this.quiescenceTimer);
        this.quiescenceTimer = null;
      }
      if (this.maxTimer) {
        clearTimeout(this.maxTimer);
        this.maxTimer = null;
      }
    }
  }

  getCachedVersion() {
    return this.cachedVersion;
  }

  async refreshCachedVersion() {
    try {
      const tags = await this.git.tags();
      const parsed = (tags.all || [])
        .map((tag) => ({ tag, semver: parseSemver(tag) }))
        .filter((t) => t.semver !== null)
        .sort((a, b) => compareSemverDesc(a.semver, b.semver));

      this.cachedVersion = parsed.length > 0
        ? `${parsed[0].semver.major}.${parsed[0].semver.minor}.${parsed[0].semver.patch}`
        : '0.0.0';
    } catch {
      this.cachedVersion = '0.0.0';
    }
  }

  async getCurrentVersion() {
    await this.refreshCachedVersion();
    return this.cachedVersion;
  }

  async listVersionTags() {
    const tags = await this.git.tags();
    return (tags.all || [])
      .map((tag) => ({ tag, semver: parseSemver(tag) }))
      .filter((t) => t.semver !== null)
      .sort((a, b) => compareSemverDesc(a.semver, b.semver))
      .map((t) => ({
        tag: t.tag,
        version: `${t.semver.major}.${t.semver.minor}.${t.semver.patch}`
      }));
  }

  async forceCommit() {
    if (!this.enabled) {
      return { committed: false, message: 'Git sync is disabled' };
    }

    if (this.committing) {
      return { committed: false, message: 'A commit is already in progress' };
    }

    await this.initialize();

    const status = await this.git.status();
    if (status.isClean()) {
      return { committed: false, message: 'Nothing to commit' };
    }

    this.dirty = true;
    await this.commit('manual-save');
    return { committed: true, message: 'Changes committed' };
  }

  async createVersionTag(bumpType, author) {
    if (!this.enabled) {
      throw new Error('Git sync is disabled');
    }

    await this.forceCommit();

    const current = await this.getCurrentVersion();
    const next = bumpSemver(current, bumpType);
    const tagName = `v${next}`;
    const message = `Version ${next} (${bumpType}) by ${author}`;

    await this.git.addAnnotatedTag(tagName, message);

    if (this.autoPush && this.remoteUrl) {
      await this.git.push('origin', tagName);
    }

    this.cachedVersion = next;
    return { previousVersion: current, newVersion: next, tag: tagName };
  }

  async shutdown() {
    if (this.quiescenceTimer) {
      clearTimeout(this.quiescenceTimer);
      this.quiescenceTimer = null;
    }
    if (this.maxTimer) {
      clearTimeout(this.maxTimer);
      this.maxTimer = null;
    }

    await this.commit('shutdown');
  }
}

module.exports = {
  GitSync
};
