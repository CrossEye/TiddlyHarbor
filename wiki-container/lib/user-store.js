const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const DEFAULT_ITERATIONS = 210000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.pbkdf2Sync(password, salt, DEFAULT_ITERATIONS, KEY_LENGTH, DIGEST).toString('base64url');
  return `pbkdf2$${DEFAULT_ITERATIONS}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') {
    return false;
  }

  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    return false;
  }

  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expectedHash = parts[3];
  if (!Number.isFinite(iterations) || iterations < 1000 || !salt || !expectedHash) {
    return false;
  }

  const actualHash = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST).toString('base64url');
  const actualBuffer = Buffer.from(actualHash);
  const expectedBuffer = Buffer.from(expectedHash);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

class UserStore {
  constructor({ dbPath, bootstrapUsername, bootstrapPassword }) {
    this.dbPath = dbPath;
    this.bootstrapUsername = bootstrapUsername || 'admin';
    this.bootstrapPassword = bootstrapPassword || 'change-me';
  }

  sqliteQuery(sql) {
    const result = spawnSync('sqlite3', ['-noheader', '-separator', '\t', this.dbPath, sql], {
      encoding: 'utf8'
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error((result.stderr || 'sqlite3 query failed').trim());
    }

    return (result.stdout || '').trim();
  }

  ensureSchema() {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });

    this.sqliteQuery(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'writer',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
    `);
  }

  bootstrapIfEmpty() {
    const countText = this.sqliteQuery('SELECT COUNT(1) FROM users;');
    const count = Number(countText || '0');
    if (!Number.isFinite(count) || count > 0) {
      return;
    }

    const username = this.bootstrapUsername.trim();
    const password = this.bootstrapPassword;
    if (!username || !password) {
      throw new Error('Bootstrap username/password missing for SQLite user store');
    }

    const passwordHash = hashPassword(password);
    this.sqliteQuery(`
      INSERT INTO users (username, password_hash, role, is_active)
      VALUES (${sqlLiteral(username)}, ${sqlLiteral(passwordHash)}, 'writer', 1);
    `);
  }

  initialize() {
    this.ensureSchema();
    this.bootstrapIfEmpty();
  }

  getUserByUsername(username) {
    if (!username) {
      return null;
    }

    const row = this.sqliteQuery(`
      SELECT username, password_hash, role, is_active
      FROM users
      WHERE username = ${sqlLiteral(username)}
      LIMIT 1;
    `);

    if (!row) {
      return null;
    }

    const [userNameValue, passwordHash, role, isActiveText] = row.split('\t');
    return {
      username: userNameValue,
      passwordHash,
      role: role || 'writer',
      isActive: isActiveText === '1'
    };
  }

  validateCredentials(username, password) {
    const user = this.getUserByUsername(username);
    if (!user || !user.isActive) {
      return null;
    }

    if (!verifyPassword(password || '', user.passwordHash)) {
      return null;
    }

    return {
      username: user.username,
      role: user.role
    };
  }
}

module.exports = {
  UserStore
};