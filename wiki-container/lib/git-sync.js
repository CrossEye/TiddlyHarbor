const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
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

/**
 * Fetch a remote repo into wikiPath if the wiki hasn't been initialized yet.
 * Uses init+fetch+checkout instead of clone, because Docker volume mount
 * points are non-empty directories (they contain filesystem artifacts).
 *
 * Must be called BEFORE ensureWikiInitialized so the fetched tiddlywiki.info
 * is found and --init server is skipped.
 *
 * Synchronous (uses spawnSync) so it fits into the existing startup sequence.
 * Returns true if a fetch was performed, false otherwise.
 */
function cloneIfNeeded(wikiPath, remoteUrl, branch) {
  if (!remoteUrl) {
    return false;
  }

  branch = branch || 'main';

  const infoPath = path.join(wikiPath, 'tiddlywiki.info');
  if (fs.existsSync(infoPath)) {
    return false;   // wiki already exists — nothing to clone
  }

  const dotGitPath = path.join(wikiPath, '.git');
  if (fs.existsSync(dotGitPath)) {
    return false;   // git repo already present
  }

  const safeUrl = remoteUrl.replace(/\/\/[^@]+@/, '//<token>@');
  console.log(`Cloning ${safeUrl} (branch: ${branch}) into ${wikiPath}...`);
  fs.mkdirSync(wikiPath, { recursive: true });

  const run = (args) => spawnSync('git', args, {
    cwd: wikiPath, stdio: 'inherit', timeout: 120000
  });

  if (run(['init', '-b', branch]).status !== 0) {
    console.error('git init failed');
    return false;
  }

  if (run(['remote', 'add', 'origin', remoteUrl]).status !== 0) {
    console.error('git remote add failed');
    return false;
  }

  if (run(['fetch', 'origin', branch]).status !== 0) {
    console.error('git fetch failed — remote may be empty or unreachable');
    return false;
  }

  if (run(['checkout', `origin/${branch}`, '-b', branch, '--force']).status !== 0) {
    console.error('git checkout failed');
    return false;
  }

  console.log('Clone complete.');
  return true;
}

class GitSync {
  constructor(repoPath, options = {}) {
    this.repoPath = repoPath;
    this.enabled = options.enabled !== false;
    this.autoPush = options.autoPush === true;
    this.quiescenceMs = options.quiescenceMs ?? 5 * 60 * 1000;
    this.maxIntervalMs = options.maxIntervalMs ?? 60 * 60 * 1000;
    this.remoteUrl = options.remoteUrl || '';
    this.branch = options.branch || 'main';
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
      await this.git.init(['-b', this.branch]);
    }

    // Ensure we're on the configured branch (e.g. after clone landed on a different default)
    try {
      const current = (await this.git.revparse(['--abbrev-ref', 'HEAD'])).trim();
      if (current && current !== this.branch) {
        await this.git.checkout(['-B', this.branch]);
      }
    } catch (_) { /* first commit hasn't happened yet — branch switch will work on next push */ }

    await this.git.addConfig('user.name', process.env.GIT_AUTHOR_NAME || 'TiddlyHarbor Bot');
    await this.git.addConfig('user.email', process.env.GIT_AUTHOR_EMAIL || 'tiddlyharbor@example.local');

    if (this.remoteUrl) {
      const remotes = await this.git.getRemotes(true);
      const origin = remotes.find((remote) => remote.name === 'origin');
      if (!origin) {
        await this.git.addRemote('origin', this.remoteUrl);
      }

      // Fetch remote tags so the version UI reflects tags created elsewhere
      try {
        await this.git.fetch('origin', ['--tags']);
      } catch (fetchErr) {
        console.error('GitSync tag fetch failed:', fetchErr.message);
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
        try {
          // Pull first to integrate any remote changes (e.g. from another clone)
          try {
            await this.git.pull('origin', this.branch, ['--rebase', '--autostash']);
          } catch (pullErr) {
            console.error('GitSync pull before push failed:', pullErr.message);
          }
          await this.git.push('origin', this.branch, ['--set-upstream']);
          console.log(`GitSync pushed to origin/${this.branch}`);
        } catch (pushErr) {
          console.error('GitSync push failed:', pushErr.message);
        }
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

    // Always push tags when a remote is configured — version tags are
    // intentional releases, unlike auto-save commits which respect autoPush.
    if (this.remoteUrl) {
      try {
        await this.git.push('origin', tagName);
        console.log(`GitSync pushed tag ${tagName} to origin`);
      } catch (pushErr) {
        console.error(`GitSync tag push failed: ${pushErr.message}`);
      }
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
  cloneIfNeeded,
  GitSync
};
