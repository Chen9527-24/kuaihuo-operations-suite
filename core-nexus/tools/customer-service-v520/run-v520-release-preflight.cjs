#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '../..');
const artifactsDir = path.join(__dirname, 'artifacts');

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function collectChangedFileArgs(argv) {
  const args = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--changed-file') continue;
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error('--changed-file requires a project-relative path');
    }
    args.push('--changed-file', value);
    i += 1;
  }
  if (args.length === 0) {
    throw new Error('at least one --changed-file is required for release preflight');
  }
  return args;
}

function collectFirewallArgs(argv) {
  const args = collectChangedFileArgs(argv);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--live-trace') continue;
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error('--live-trace requires a trace file path');
    }
    args.push('--live-trace', value);
    i += 1;
  }
  return args;
}

function runAndTee(scriptPath, args, logStream) {
  return new Promise((resolve) => {
    const child = cp.spawn(process.execPath, [scriptPath, ...args], {
      cwd: root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      logStream.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      logStream.write(chunk);
    });
    child.on('error', (error) => {
      const line = `[RELEASE PREFLIGHT] child process error · ${error?.stack || error}\n`;
      process.stderr.write(line);
      logStream.write(line);
      resolve(1);
    });
    child.on('close', (code) => resolve(Number.isInteger(code) ? code : 1));
  });
}

async function main() {
  let changedArgs;
  try {
    changedArgs = collectFirewallArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[RELEASE PREFLIGHT] INVALID_ARGUMENT · ${error.message}`);
    process.exit(2);
  }

  fs.mkdirSync(artifactsDir, { recursive: true });
  const logPath = path.join(artifactsDir, `release-preflight-${timestampForFile()}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: 'wx' });
  const relativeLogPath = path.relative(root, logPath).replace(/\\/g, '/');
  const header = `[RELEASE PREFLIGHT] Full output log: ${relativeLogPath}\n`;
  process.stdout.write(header);
  logStream.write(header);

  const buildScript = path.join(__dirname, 'run-v520-release-build-gate.cjs');
  const firewallScript = path.join(__dirname, 'run-v520-release-regression-firewall.cjs');

  const buildExit = await runAndTee(buildScript, [], logStream);
  const firewallExit = await runAndTee(firewallScript, changedArgs, logStream);
  const ok = buildExit === 0 && firewallExit === 0;
  const summary = `[RELEASE PREFLIGHT] ${ok ? 'PASS' : 'BLOCKED'} · buildExit=${buildExit} · p0Exit=${firewallExit} · log=${relativeLogPath}\n`;
  process.stdout.write(summary);
  logStream.write(summary);
  logStream.end(() => process.exit(ok ? 0 : 1));
}

module.exports = { timestampForFile, collectChangedFileArgs, collectFirewallArgs };
if (require.main === module) main();
