const fs = require('fs');
const path = require('path');
const { simpleGit } = require('simple-git');

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
