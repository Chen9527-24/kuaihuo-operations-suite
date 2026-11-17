#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '../..');
const packageJsonPath = path.join(root, 'package.json');

function readProjectPackage() {
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
}

function parsePackageManager(value) {
  const match = String(value || '').trim().match(/^([a-zA-Z0-9_-]+)@([^\s]+)$/);
  return match ? { name: match[1], version: match[2] } : null;
}

function packageManagerInvocation(name, args, platform = process.platform, comspec = process.env.ComSpec) {
  if (platform === 'win32') {
    return { command: comspec || 'cmd.exe', args: ['/d', '/c', `${name}.cmd`, ...args] };
  }
  return { command: name, args };
}

function spawnPackageManager(name, args, options = {}) {
  const invocation = packageManagerInvocation(name, args);
  return cp.spawnSync(invocation.command, invocation.args, options);
}

function classifyBuildFailure(proc) {
  if (proc?.error?.code === 'ENOENT') return 'BUILD_ENVIRONMENT_BLOCKED';
  const text = `${proc?.stdout || ''}\n${proc?.stderr || ''}`;
  const environmentPatterns = [
    /Cannot find module ['"][^'"]+['"]/i,
    /MODULE_NOT_FOUND/i,
    /ERR_MODULE_NOT_FOUND/i,
    /Cannot find package ['"][^'"]+['"]/i,
    /command not found/i,
    /not recognized as an internal or external command/i,
    /node_modules[^\n]*(?:missing|not found|ENOENT)/i,
    /prisma[^\n]*(?:not found|ENOENT)/i,
  ];
  return environmentPatterns.some((pattern) => pattern.test(text))
    ? 'BUILD_ENVIRONMENT_BLOCKED'
    : 'BUILD_FAIL';
}

function runReleaseBuild(options = {}) {
  const pkg = readProjectPackage();
  const declared = parsePackageManager(pkg.packageManager);
  if (!declared || declared.name !== 'pnpm') {
    return { ok: false, outcome: 'BUILD_ENVIRONMENT_BLOCKED', detail: `unsupported or missing packageManager=${pkg.packageManager || 'missing'}` };
  }
  if (!fs.existsSync(path.join(root, 'node_modules'))) {
    return { ok: false, outcome: 'BUILD_ENVIRONMENT_BLOCKED', detail: 'node_modules is absent; release build cannot be proven' };
  }

  const versionProbe = spawnPackageManager(declared.name, ['--version'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  if (versionProbe.status !== 0) {
    return { ok: false, outcome: 'BUILD_ENVIRONMENT_BLOCKED', detail: versionProbe.error?.code === 'ENOENT' ? 'pnpm executable is unavailable' : `pnpm version probe exit=${versionProbe.status}` };
  }
  const actualVersion = String(versionProbe.stdout || '').trim();
  if (actualVersion !== declared.version) {
    return { ok: false, outcome: 'BUILD_ENVIRONMENT_BLOCKED', detail: `pnpm version mismatch: expected=${declared.version} actual=${actualVersion || 'unknown'}` };
  }

  const proc = spawnPackageManager(declared.name, ['run', 'build'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CI: process.env.CI || '1' },
    windowsHide: true,
  });
  if (!options.quiet) {
    if (proc.stdout) process.stdout.write(proc.stdout);
    if (proc.stderr) process.stderr.write(proc.stderr);
  }
  if (proc.status === 0) return { ok: true, outcome: 'BUILD_PASS', detail: `pnpm@${actualVersion} run build exit=0` };
  const outcome = classifyBuildFailure(proc);
  return { ok: false, outcome, detail: `pnpm@${actualVersion} run build exit=${proc.status}` };
}

function main() {
  const result = runReleaseBuild();
  const stream = result.ok ? console.log : console.error;
  stream(`[RELEASE BUILD] ${result.outcome} · ${result.detail}`);
  process.exit(result.ok ? 0 : 1);
}

module.exports = { parsePackageManager, packageManagerInvocation, classifyBuildFailure, runReleaseBuild };
if (require.main === module) main();
