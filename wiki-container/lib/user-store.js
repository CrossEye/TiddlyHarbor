const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const DEFAULT_ITERATIONS = 210000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';

function hasWriteAccess(role) {
  return role === 'writer' || role === 'admin';
}

function hasAdminAccess(role) {
  return role === 'admin';
}

function toPublicUser(user) {
  if (!user) {
    return null;
  }

  return {
    username: user.username,
    role: user.role || 'writer',
    isActive: user.isActive === true,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

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

  static normalizeRole(role) {
    const normalized = String(role || 'writer').trim().toLowerCase();
    if (!['reader', 'writer', 'admin'].includes(normalized)) {
      throw new Error(`Unsupported role: ${role}`);
    }

    return normalized;
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
      VALUES (${sqlLiteral(username)}, ${sqlLiteral(passwordHash)}, 'admin', 1);
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
      SELECT username, password_hash, role, is_active, created_at, updated_at
      FROM users
      WHERE username = ${sqlLiteral(username)}
      LIMIT 1;
    `);

    if (!row) {
      return null;
    }

    const [userNameValue, passwordHash, role, isActiveText, createdAt, updatedAt] = row.split('\t');
    return {
      username: userNameValue,
      passwordHash,
      role: role || 'writer',
      isActive: isActiveText === '1',
      createdAt,
      updatedAt
    };
  }

  countActiveAdmins() {
    const countText = this.sqliteQuery(`
      SELECT COUNT(1)
      FROM users
      WHERE role = 'admin' AND is_active = 1;
    `);

    const count = Number(countText || '0');
    return Number.isFinite(count) ? count : 0;
  }

  assertNotRemovingLastActiveAdmin(user) {
    if (!user || user.role !== 'admin' || !user.isActive) {
      return;
    }

    const activeAdmins = this.countActiveAdmins();
    if (activeAdmins <= 1) {
      throw new Error('Refusing to remove or disable the last active admin account');
    }
  }

  listUsers() {
    const output = this.sqliteQuery(`
      SELECT username, role, is_active, created_at, updated_at
      FROM users
      ORDER BY username ASC;
    `);

    if (!output) {
      return [];
    }

    return output.split(/\r?\n/).filter(Boolean).map((line) => {
      const [username, role, isActiveText, createdAt, updatedAt] = line.split('\t');
      return {
        username,
        role: role || 'writer',
        isActive: isActiveText === '1',
        createdAt,
        updatedAt
      };
    });
  }

  createUser({ username, password, role = 'writer' }) {
    const trimmedUsername = String(username || '').trim();
    if (!trimmedUsername) {
      throw new Error('Username is required');
    }

    if (!password) {
      throw new Error('Password is required');
    }

    const normalizedRole = UserStore.normalizeRole(role);
    const passwordHash = hashPassword(password);

    this.sqliteQuery(`
      INSERT INTO users (username, password_hash, role, is_active, updated_at)
      VALUES (
        ${sqlLiteral(trimmedUsername)},
        ${sqlLiteral(passwordHash)},
        ${sqlLiteral(normalizedRole)},
        1,
        datetime('now')
      );
    `);

    return toPublicUser(this.getUserByUsername(trimmedUsername));
  }

  setPassword(username, password) {
    const trimmedUsername = String(username || '').trim();
    if (!trimmedUsername) {
      throw new Error('Username is required');
    }

    if (!password) {
      throw new Error('Password is required');
    }

    const passwordHash = hashPassword(password);
    this.sqliteQuery(`
      UPDATE users
      SET password_hash = ${sqlLiteral(passwordHash)},
          updated_at = datetime('now')
      WHERE username = ${sqlLiteral(trimmedUsername)};
    `);

    const user = this.getUserByUsername(trimmedUsername);
    if (!user) {
      throw new Error(`User not found: ${trimmedUsername}`);
    }

    return toPublicUser(user);
  }

  setRole(username, role) {
    const trimmedUsername = String(username || '').trim();
    if (!trimmedUsername) {
      throw new Error('Username is required');
    }

    const existingUser = this.getUserByUsername(trimmedUsername);
    if (!existingUser) {
      throw new Error(`User not found: ${trimmedUsername}`);
    }

    const normalizedRole = UserStore.normalizeRole(role);
    if (existingUser.role === 'admin' && normalizedRole !== 'admin') {
      this.assertNotRemovingLastActiveAdmin(existingUser);
    }

    this.sqliteQuery(`
      UPDATE users
      SET role = ${sqlLiteral(normalizedRole)},
          updated_at = datetime('now')
      WHERE username = ${sqlLiteral(trimmedUsername)};
    `);

    const user = this.getUserByUsername(trimmedUsername);
    return toPublicUser(user);
  }

  setActive(username, isActive) {
    const trimmedUsername = String(username || '').trim();
    if (!trimmedUsername) {
      throw new Error('Username is required');
    }

    const existingUser = this.getUserByUsername(trimmedUsername);
    if (!existingUser) {
      throw new Error(`User not found: ${trimmedUsername}`);
    }

    if (existingUser.role === 'admin' && existingUser.isActive && !isActive) {
      this.assertNotRemovingLastActiveAdmin(existingUser);
    }

    this.sqliteQuery(`
      UPDATE users
      SET is_active = ${isActive ? 1 : 0},
          updated_at = datetime('now')
      WHERE username = ${sqlLiteral(trimmedUsername)};
    `);

    const user = this.getUserByUsername(trimmedUsername);
    return toPublicUser(user);
  }

  deleteUser(username) {
    const trimmedUsername = String(username || '').trim();
    if (!trimmedUsername) {
      throw new Error('Username is required');
    }

    const existingUser = this.getUserByUsername(trimmedUsername);
    if (!existingUser) {
      throw new Error(`User not found: ${trimmedUsername}`);
    }

    this.assertNotRemovingLastActiveAdmin(existingUser);

    this.sqliteQuery(`
      DELETE FROM users
      WHERE username = ${sqlLiteral(trimmedUsername)};
    `);

    return toPublicUser(existingUser);
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
  hasAdminAccess,
  hasWriteAccess,
  UserStore
};