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

function isPendingRole(role) {
  return role === 'pending';
}

function toPublicUser(user) {
  if (!user) {
    return null;
  }

  return {
    username: user.username,
    role: user.role || 'writer',
    isActive: user.isActive === true,
    oauthProvider: user.oauthProvider || null,
    email: user.email || null,
    displayName: user.displayName || null,
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
    if (!['pending', 'reader', 'writer', 'admin'].includes(normalized)) {
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

    this.migrateOAuthColumns();
  }

  migrateOAuthColumns() {
    const columns = ['oauth_provider', 'oauth_id', 'email', 'display_name'];
    for (const col of columns) {
      try {
        this.sqliteQuery(`ALTER TABLE users ADD COLUMN ${col} TEXT DEFAULT NULL;`);
      } catch {
        // Column already exists — safe to ignore
      }
    }

    this.sqliteQuery(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth
      ON users(oauth_provider, oauth_id)
      WHERE oauth_provider IS NOT NULL;
    `);
  }

  ensureTokenTable() {
    this.sqliteQuery(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL,
        token_type TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_prt_token_hash ON password_reset_tokens(token_hash);
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
    this.ensureTokenTable();
    this.bootstrapIfEmpty();
  }

  getUserByUsername(username) {
    if (!username) {
      return null;
    }

    const row = this.sqliteQuery(`
      SELECT username, password_hash, role, is_active, created_at, updated_at,
             oauth_provider, oauth_id, email, display_name
      FROM users
      WHERE username = ${sqlLiteral(username)}
      LIMIT 1;
    `);

    if (!row) {
      return null;
    }

    const [userNameValue, passwordHash, role, isActiveText, createdAt, updatedAt,
           oauthProvider, oauthId, email, displayName] = row.split('\t');
    return {
      username: userNameValue,
      passwordHash,
      role: role || 'writer',
      isActive: isActiveText === '1',
      oauthProvider: oauthProvider || null,
      oauthId: oauthId || null,
      email: email || null,
      displayName: displayName || null,
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
      SELECT username, role, is_active, created_at, updated_at,
             oauth_provider, email, display_name
      FROM users
      ORDER BY username ASC;
    `);

    if (!output) {
      return [];
    }

    return output.split(/\r?\n/).filter(Boolean).map((line) => {
      const [username, role, isActiveText, createdAt, updatedAt,
             oauthProvider, email, displayName] = line.split('\t');
      return {
        username,
        role: role || 'writer',
        isActive: isActiveText === '1',
        oauthProvider: oauthProvider || null,
        email: email || null,
        displayName: displayName || null,
        createdAt,
        updatedAt
      };
    });
  }

  createUser({ username, password, email, role = 'writer' }) {
    const trimmedUsername = String(username || '').trim();
    if (!trimmedUsername) {
      throw new Error('Username is required');
    }

    if (!password && !email) {
      throw new Error('Either password or email is required');
    }

    const normalizedRole = UserStore.normalizeRole(role);
    const isInvite = !password;
    const passwordHash = isInvite ? 'invite-pending' : hashPassword(password);
    const isActive = isInvite ? 0 : 1;

    this.sqliteQuery(`
      INSERT INTO users (username, password_hash, role, is_active, email, updated_at)
      VALUES (
        ${sqlLiteral(trimmedUsername)},
        ${sqlLiteral(passwordHash)},
        ${sqlLiteral(normalizedRole)},
        ${isActive},
        ${sqlLiteral(email || '')},
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

    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    // Activate invite-pending users when they set their password
    const existing = this.getUserByUsername(trimmedUsername);
    if (!existing) {
      throw new Error(`User not found: ${trimmedUsername}`);
    }

    const activate = existing.passwordHash === 'invite-pending';
    const passwordHash = hashPassword(password);
    this.sqliteQuery(`
      UPDATE users
      SET password_hash = ${sqlLiteral(passwordHash)},
          ${activate ? 'is_active = 1,' : ''}
          updated_at = datetime('now')
      WHERE username = ${sqlLiteral(trimmedUsername)};
    `);

    return toPublicUser(this.getUserByUsername(trimmedUsername));
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

  setEmail(username, email) {
    const trimmedUsername = String(username || '').trim();
    if (!trimmedUsername) {
      throw new Error('Username is required');
    }

    const existingUser = this.getUserByUsername(trimmedUsername);
    if (!existingUser) {
      throw new Error(`User not found: ${trimmedUsername}`);
    }

    this.sqliteQuery(`
      UPDATE users
      SET email = ${sqlLiteral((email || '').trim())},
          updated_at = datetime('now')
      WHERE username = ${sqlLiteral(trimmedUsername)};
    `);

    return toPublicUser(this.getUserByUsername(trimmedUsername));
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

  findByOAuth(provider, oauthId) {
    if (!provider || !oauthId) {
      return null;
    }

    const row = this.sqliteQuery(`
      SELECT username, password_hash, role, is_active, created_at, updated_at,
             oauth_provider, oauth_id, email, display_name
      FROM users
      WHERE oauth_provider = ${sqlLiteral(provider)}
        AND oauth_id = ${sqlLiteral(oauthId)}
      LIMIT 1;
    `);

    if (!row) {
      return null;
    }

    const [username, passwordHash, role, isActiveText, createdAt, updatedAt,
           oauthProvider, oauthIdVal, email, displayName] = row.split('\t');
    return {
      username,
      passwordHash,
      role: role || 'writer',
      isActive: isActiveText === '1',
      oauthProvider: oauthProvider || null,
      oauthId: oauthIdVal || null,
      email: email || null,
      displayName: displayName || null,
      createdAt,
      updatedAt
    };
  }

  createOAuthUser({ provider, oauthId, email, displayName }) {
    if (!provider || !oauthId) {
      throw new Error('OAuth provider and ID are required');
    }

    const username = `${provider}:${oauthId}`;
    const placeholderHash = 'oauth-no-password';

    this.sqliteQuery(`
      INSERT INTO users (username, password_hash, role, is_active,
                         oauth_provider, oauth_id, email, display_name, updated_at)
      VALUES (
        ${sqlLiteral(username)},
        ${sqlLiteral(placeholderHash)},
        'pending',
        1,
        ${sqlLiteral(provider)},
        ${sqlLiteral(oauthId)},
        ${sqlLiteral(email || '')},
        ${sqlLiteral(displayName || '')},
        datetime('now')
      );
    `);

    return toPublicUser(this.getUserByUsername(username));
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

  getUserByEmail(email) {
    if (!email) return null;

    const row = this.sqliteQuery(`
      SELECT username, password_hash, role, is_active, created_at, updated_at,
             oauth_provider, oauth_id, email, display_name
      FROM users
      WHERE email = ${sqlLiteral(email)} AND email != ''
      LIMIT 1;
    `);

    if (!row) return null;

    const [username, passwordHash, role, isActiveText, createdAt, updatedAt,
           oauthProvider, oauthId, emailVal, displayName] = row.split('\t');
    return {
      username, passwordHash, role: role || 'writer',
      isActive: isActiveText === '1',
      oauthProvider: oauthProvider || null, oauthId: oauthId || null,
      email: emailVal || null, displayName: displayName || null,
      createdAt, updatedAt
    };
  }

  createToken(username, tokenType) {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiryHours = tokenType === 'invite' ? 72 : 1;
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

    // Invalidate any existing unconsumed tokens of this type for the user
    this.sqliteQuery(`
      UPDATE password_reset_tokens
      SET consumed_at = datetime('now')
      WHERE username = ${sqlLiteral(username)}
        AND token_type = ${sqlLiteral(tokenType)}
        AND consumed_at IS NULL;
    `);

    this.sqliteQuery(`
      INSERT INTO password_reset_tokens (token_hash, username, token_type, expires_at)
      VALUES (${sqlLiteral(tokenHash)}, ${sqlLiteral(username)}, ${sqlLiteral(tokenType)}, ${sqlLiteral(expiresAt)});
    `);

    return rawToken;
  }

  validateToken(rawToken) {
    if (!rawToken) return null;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const row = this.sqliteQuery(`
      SELECT username, token_type, expires_at
      FROM password_reset_tokens
      WHERE token_hash = ${sqlLiteral(tokenHash)}
        AND consumed_at IS NULL
        AND expires_at > datetime('now')
      LIMIT 1;
    `);

    if (!row) return null;
    const [username, tokenType] = row.split('\t');
    return { username, tokenType };
  }

  consumeToken(rawToken) {
    const info = this.validateToken(rawToken);
    if (!info) return null;

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    this.sqliteQuery(`
      UPDATE password_reset_tokens
      SET consumed_at = datetime('now')
      WHERE token_hash = ${sqlLiteral(tokenHash)}
        AND consumed_at IS NULL;
    `);

    return info;
  }

  purgeExpiredTokens() {
    this.sqliteQuery(`
      DELETE FROM password_reset_tokens
      WHERE expires_at < datetime('now');
    `);
  }

  getAdminEmails() {
    const output = this.sqliteQuery(
      "SELECT email FROM users WHERE role = 'admin' AND is_active = 1 AND email IS NOT NULL AND email != '';"
    );
    if (!output) return [];
    return output.split(/\r?\n/).filter(Boolean).map((line) => line.trim());
  }
}

module.exports = {
  hasAdminAccess,
  hasWriteAccess,
  isPendingRole,
  UserStore
};