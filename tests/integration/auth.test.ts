import request from 'supertest';
import { createApp } from '../../src/app';
import { disconnectDb, registerUser, resetDb } from './helpers';

const app = createApp();

beforeEach(resetDb);
afterAll(disconnectDb);

describe('auth endpoints', () => {
  it('GET /health responds ok', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body).toEqual({ data: { status: 'ok' } });
  });

  it('registers, logs in and returns the current user', async () => {
    const ada = await registerUser(app, 'Ada');

    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'ADA@example.com', password: 'password-123' })
      .expect(200);
    expect(login.body.data.user).toMatchObject({ id: ada.id, email: 'ada@example.com' });

    const me = await request(app).get('/auth/me').set(ada.auth).expect(200);
    expect(me.body.data).toMatchObject({ id: ada.id, name: 'Ada' });
    expect(me.body.data).not.toHaveProperty('passwordHash');
  });

  it('rejects a duplicate email with 409', async () => {
    await registerUser(app, 'Ada');
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'ada@example.com', name: 'Ada', password: 'password-123' })
      .expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns field-level validation errors in the error envelope', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', name: '', password: 'short' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['email', 'name', 'password']));
  });

  it('rejects requests without a valid token', async () => {
    await request(app).get('/auth/me').expect(401);
    await request(app).get('/auth/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
  });
});
