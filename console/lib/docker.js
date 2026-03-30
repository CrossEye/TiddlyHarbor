'use strict';

const fs = require('fs');
const { exec } = require('child_process');
const yaml = require('js-yaml');

function execPromise(cmd, options = {}) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 120000, ...options }, (err, stdout, stderr) => {
      resolve({ success: !err, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

async function getContainerStatus() {
  const result = await execPromise('docker ps -a --filter "name=wiki-" --format "{{json .}}"');
  const status = new Map();

  if (!result.success || !result.stdout.trim()) {
    return status;
  }

  for (const line of result.stdout.trim().split('\n')) {
    if (!line.trim()) continue;
    try {
      const info = JSON.parse(line);
      // Container names look like "tiddlyharbor-wiki-main-1" or "wiki-main-1"
      // Extract the site name by finding "wiki-" and taking everything after until the trailing "-N"
      const name = info.Names || '';
      const match = name.match(/wiki-([a-z][a-z0-9-]*?)(?:-\d+)?$/);
      if (match) {
        status.set(match[1], {
          running: info.State === 'running',
          status: info.Status || 'unknown'
        });
      }
    } catch (_) { /* skip unparseable lines */ }
  }

  return status;
}

async function applyConfig(hostProjectDir) {
  // Step 1: regenerate docker-compose.yml and Caddyfile
  const genResult = await execPromise('node /app/scripts/generate-config.js');
  if (!genResult.success) {
    return {
      success: false,
      stdout: genResult.stdout,
      stderr: `Config generation failed:\n${genResult.stderr}`
    };
  }

  // Step 2: docker compose up wiki services only (exclude console + caddy to stay alive)
  const projectName = hostProjectDir.replace(/[\\/]+$/, '').split(/[\\/]/).pop().toLowerCase();
  const compose = yaml.load(fs.readFileSync('/app/docker-compose.yml', 'utf8'));
  const wikiServices = Object.keys(compose.services || {}).filter((s) => s !== 'console' && s !== 'caddy');
  const composeCmd = `docker compose -f /app/docker-compose.yml -p ${projectName} up -d --no-build ${wikiServices.join(' ')}`;
  const composeResult = await execPromise(composeCmd, { timeout: 300000 });

  // Step 3: reload Caddy config without restarting
  const caddyReload = await execPromise(
    `docker exec ${projectName}-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile`
  );

  const allStdout = [genResult.stdout, composeResult.stdout, caddyReload.stdout].filter(Boolean).join('\n').trim();
  const allStderr = [genResult.stderr, composeResult.stderr, caddyReload.stderr].filter(Boolean).join('\n').trim();

  return {
    success: composeResult.success && caddyReload.success,
    stdout: allStdout,
    stderr: allStderr
  };
}

async function stopAndRemoveContainer(projectName, serviceName) {
  // Stop container first, then remove it
  const name = `${projectName}-${serviceName}-1`;
  await execPromise(`docker stop ${name}`);
  await execPromise(`docker rm ${name}`);
}

async function deleteVolume(projectName, siteName) {
  const volumeName = `${projectName}_wiki_${siteName}_data`;
  const result = await execPromise(`docker volume rm ${volumeName}`);
  return result;
}

module.exports = { getContainerStatus, applyConfig, stopAndRemoveContainer, deleteVolume };
