import { execSync } from 'node:child_process';
import { Client } from 'pg';
import './setup-env';

/** Creates the test database if it does not exist, then applies migrations and seeds plans. */
export default async function globalSetup() {
  const url = new URL(process.env.DATABASE_URL!);
  const dbName = url.pathname.slice(1);

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
  execSync('npx prisma db seed', { stdio: 'inherit', env: process.env });
}
