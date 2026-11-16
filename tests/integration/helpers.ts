import request from 'supertest';
import type { Express } from 'express';
import { getPrisma } from '../../src/common/db';
import type { Role } from '../../src/generated/prisma/client';

/** Empties every table except the seeded plans. */
export async function resetDb() {
  await getPrisma().$executeRawUnsafe(
    'TRUNCATE users, organisations, memberships, invites, subscriptions, usage_records, processed_webhook_events CASCADE',
  );
}

export async function disconnectDb() {
  await getPrisma().$disconnect();
}

export type TestUser = {
  id: string;
  email: string;
  token: string;
  auth: { Authorization: string };
};

export async function registerUser(app: Express, name: string): Promise<TestUser> {
  const email = `${name.toLowerCase()}@example.com`;
  const res = await request(app)
    .post('/auth/register')
    .send({ email, name, password: 'password-123' })
    .expect(201);
  const { user, token } = res.body.data;
  return { id: user.id, email, token, auth: { Authorization: `Bearer ${token}` } };
}

/** Test setup shortcut: adds a membership directly (the owner connection is not subject to RLS). */
export async function addMember(orgId: string, user: TestUser, role: Role) {
  const membership = await getPrisma().membership.create({
    data: { orgId, userId: user.id, role },
  });
  return membership.id;
}

export async function createOrg(app: Express, owner: TestUser, slug: string): Promise<string> {
  const res = await request(app)
    .post('/orgs')
    .set(owner.auth)
    .send({ name: slug, slug })
    .expect(201);
  return res.body.data.id;
}
