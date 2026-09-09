import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

const source = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(source.hostname)) {
  throw new Error('Billing integration tests require a local MySQL DATABASE_URL');
}
const database = `wpa_billing_test_${randomBytes(8).toString('hex')}`;
const admin = new PrismaClient();
const target = new URL(source); target.pathname = `/${database}`;
async function run(args) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: {
    ...process.env, DATABASE_URL: target.toString(), BILLING_TEST_DATABASE_URL: target.toString(),
  } });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Test command exited ${code}`)));
  });
}
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE \`${database}\``);
  await run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  await run(['node_modules/vitest/vitest.mjs', 'run', 'tests/billing.mysql.test.ts']);
} finally {
  // This name is generated above, never supplied by an environment variable.
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${database}\``);
  await admin.$disconnect();
}
