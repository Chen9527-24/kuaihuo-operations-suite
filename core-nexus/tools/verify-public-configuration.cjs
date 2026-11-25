const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
require('ts-node/register/transpile-only');
const { validateEnv } = require('../src/config/validate-env.ts');

const base = {
  DATABASE_URL: 'postgresql://configuration_test:configuration_test@127.0.0.1:1/configuration_test',
  REDIS_URL: 'redis://127.0.0.1:1',
  JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
  JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
};
let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`[PASS] ${name}`);
}
check('database configuration is required', () => assert.throws(() => validateEnv({ ...base, DATABASE_URL: '' })));
check('JWT secret cannot be empty', () => assert.throws(() => validateEnv({ ...base, JWT_ACCESS_SECRET: '' })));
check('access and refresh secrets must differ', () => assert.throws(() => validateEnv({ ...base, JWT_REFRESH_SECRET: base.JWT_ACCESS_SECRET })));
check('unsupported SMS provider is rejected early', () => assert.throws(() => validateEnv({ ...base, SMS_PROVIDER: 'aliyun' })));
check('no default administrator password', () => assert.equal(validateEnv(base).SEED_ADMIN_PASSWORD, undefined));
check('no deployment-specific Coze defaults', () => {
  const config = validateEnv(base);
  for (const key of ['COZE_COMMENT_REPLY_WORKFLOW_ID', 'COZE_COMMENT_INTENT_WORKFLOW_ID', 'COZE_DM_CHAT_WORKFLOW_ID', 'COZE_DM_CHAT_BOT_ID']) assert.equal(config[key], '');
});

const workdir = mkdtempSync(join(tmpdir(), 'core-nexus-config-test-'));
try {
  const cli = require.resolve('tsx/cli');
  const seed = resolve(__dirname, '../prisma/seed.ts');
  const env = { PATH: process.env.PATH, NODE_ENV: 'development', DATABASE_URL: base.DATABASE_URL };
  check('seed rejects missing username before database work', () => {
    const result = spawnSync(process.execPath, [cli, seed], { cwd: workdir, env, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('SEED_ADMIN_USERNAME'));
    assert.ok(!result.stderr.includes('P1001'));
  });
  check('seed rejects missing/short password before database work', () => {
    const result = spawnSync(process.execPath, [cli, seed], { cwd: workdir, env: { ...env, SEED_ADMIN_USERNAME: 'configuration-test', SEED_ADMIN_PASSWORD: 'short' }, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('SEED_ADMIN_PASSWORD'));
    assert.ok(!result.stderr.includes('P1001'));
  });
} finally {
  rmSync(workdir, { recursive: true, force: true });
}
console.log(`Public configuration checks passed: ${checks}. No database or external service was called.`);
