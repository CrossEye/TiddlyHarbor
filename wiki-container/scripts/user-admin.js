const path = require('path');
const dotenv = require('dotenv');
const { UserStore } = require('../lib/user-store');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

function usage() {
  console.log('Usage: node scripts/user-admin.js <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  list');
  console.log('  create <username> <password> [role]');
  console.log('  set-password <username> <password>');
  console.log('  set-role <username> <reader|writer|admin>');
  console.log('  enable <username>');
  console.log('  disable <username>');
  console.log('  delete <username>');
  console.log('');
  console.log('Run inside a wiki container, for example:');
  console.log('  docker compose exec wiki-main node scripts/user-admin.js list');
}

function printUser(user) {
  console.log(JSON.stringify({
    username: user.username,
    role: user.role,
    isActive: user.isActive
  }, null, 2));
}

function printUsers(users) {
  if (users.length === 0) {
    console.log('No users found.');
    return;
  }

  for (const user of users) {
    console.log(`${user.username}\t${user.role}\t${user.isActive ? 'active' : 'disabled'}\t${user.createdAt}`);
  }
}

function main() {
  const [, , command, ...args] = process.argv;
  if (!command || command === '--help' || command === '-h') {
    usage();
    process.exit(command ? 0 : 1);
  }

  const wikiName = process.env.WIKI_NAME || 'main';
  const wikiPath = process.env.WIKI_PATH || path.join(__dirname, '..', 'wiki');
  const store = new UserStore({
    dbPath: process.env.AUTH_DB_PATH || path.join(wikiPath, '.tiddlyharbor', 'auth.sqlite3'),
    bootstrapUsername: process.env.BASIC_AUTH_USER || 'admin',
    bootstrapPassword: process.env.BASIC_AUTH_PASS || 'change-me'
  });

  store.initialize();

  switch (command) {
    case 'list':
      printUsers(store.listUsers());
      return;

    case 'create': {
      const [username, password, role] = args;
      const user = store.createUser({ username, password, role });
      console.log(`Created user in ${wikiName}:`);
      printUser(user);
      return;
    }

    case 'set-password': {
      const [username, password] = args;
      const user = store.setPassword(username, password);
      console.log(`Updated password in ${wikiName}:`);
      printUser(user);
      return;
    }

    case 'set-role': {
      const [username, role] = args;
      const user = store.setRole(username, role);
      console.log(`Updated role in ${wikiName}:`);
      printUser(user);
      return;
    }

    case 'enable': {
      const [username] = args;
      const user = store.setActive(username, true);
      console.log(`Enabled user in ${wikiName}:`);
      printUser(user);
      return;
    }

    case 'disable': {
      const [username] = args;
      const user = store.setActive(username, false);
      console.log(`Disabled user in ${wikiName}:`);
      printUser(user);
      return;
    }

    case 'delete': {
      const [username] = args;
      const user = store.deleteUser(username);
      console.log(`Deleted user in ${wikiName}:`);
      printUser(user);
      return;
    }

    default:
      usage();
      throw new Error(`Unknown command: ${command}`);
  }
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}