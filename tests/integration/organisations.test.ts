import request from 'supertest';
import { createApp } from '../../src/app';
import {
  addMember,
  createOrg,
  disconnectDb,
  registerUser,
  resetDb,
  type TestUser,
} from './helpers';

const app = createApp();

let owner: TestUser;
let orgId: string;

beforeEach(async () => {
  await resetDb();
  owner = await registerUser(app, 'Owner');
  orgId = await createOrg(app, owner, 'acme');
});
afterAll(disconnectDb);

describe('organisations', () => {
  it('creates an org with the creator as owner on the free plan', async () => {
    const list = await request(app).get('/orgs').set(owner.auth).expect(200);
    expect(list.body.data).toEqual([expect.objectContaining({ id: orgId, role: 'OWNER' })]);
    expect(list.body.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });

    const sub = await request(app).get('/plans').expect(200);
    expect(sub.body.data.map((p: { code: string }) => p.code)).toEqual(['free', 'pro', 'business']);
  });

  it('rejects a duplicate slug with 409', async () => {
    const res = await request(app)
      .post('/orgs')
      .set(owner.auth)
      .send({ name: 'Other', slug: 'acme' })
      .expect(409);
    expect(res.body.error.message).toBe('Slug is already taken');
  });

  it('lets admins update and only owners delete', async () => {
    const admin = await registerUser(app, 'Admin');
    await addMember(orgId, admin, 'ADMIN');

    await request(app)
      .patch(`/orgs/${orgId}`)
      .set(admin.auth)
      .send({ name: 'Acme Ltd' })
      .expect(200);
    await request(app).delete(`/orgs/${orgId}`).set(admin.auth).expect(403);
    await request(app).delete(`/orgs/${orgId}`).set(owner.auth).expect(204);
    await request(app).get(`/orgs/${orgId}`).set(owner.auth).expect(404);
  });

  it('returns 404 (not 403) to non-members', async () => {
    const stranger = await registerUser(app, 'Stranger');
    await request(app).get(`/orgs/${orgId}`).set(stranger.auth).expect(404);
  });

  it('rejects a malformed org id with 400', async () => {
    const res = await request(app).get('/orgs/not-a-uuid').set(owner.auth).expect(400);
    expect(res.body.error.details[0]).toMatchObject({ location: 'params', path: 'orgId' });
  });
});

describe('memberships', () => {
  it('lists members with pagination', async () => {
    const member = await registerUser(app, 'Member');
    await addMember(orgId, member, 'MEMBER');

    const res = await request(app)
      .get(`/orgs/${orgId}/members?pageSize=1&page=2`)
      .set(owner.auth)
      .expect(200);
    expect(res.body.meta).toEqual({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
    expect(res.body.data[0].user).toEqual({ id: member.id, email: member.email, name: 'Member' });
  });

  it('only owners can promote to owner', async () => {
    const admin = await registerUser(app, 'Admin');
    const member = await registerUser(app, 'Member');
    await addMember(orgId, admin, 'ADMIN');
    const memberId = await addMember(orgId, member, 'MEMBER');

    await request(app)
      .patch(`/orgs/${orgId}/members/${memberId}`)
      .set(admin.auth)
      .send({ role: 'OWNER' })
      .expect(403);
    const res = await request(app)
      .patch(`/orgs/${orgId}/members/${memberId}`)
      .set(owner.auth)
      .send({ role: 'OWNER' })
      .expect(200);
    expect(res.body.data.role).toBe('OWNER');
  });

  it('keeps at least one owner', async () => {
    const members = await request(app).get(`/orgs/${orgId}/members`).set(owner.auth);
    const ownerMembershipId = members.body.data[0].id;

    const res = await request(app)
      .delete(`/orgs/${orgId}/members/${ownerMembershipId}`)
      .set(owner.auth)
      .expect(409);
    expect(res.body.error.message).toBe('An organisation must keep at least one owner');
  });

  it('lets a member leave but not remove others', async () => {
    const alice = await registerUser(app, 'Alice');
    const bob = await registerUser(app, 'Bob');
    const aliceId = await addMember(orgId, alice, 'MEMBER');
    const bobId = await addMember(orgId, bob, 'MEMBER');

    await request(app).delete(`/orgs/${orgId}/members/${bobId}`).set(alice.auth).expect(403);
    await request(app).delete(`/orgs/${orgId}/members/${aliceId}`).set(alice.auth).expect(204);
    await request(app).get(`/orgs/${orgId}`).set(alice.auth).expect(404);
  });
});
