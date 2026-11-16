import { ConflictError, UnauthorizedError } from '../../src/common/errors';
import type { User } from '../../src/generated/prisma/client';
import type { UserRepository } from '../../src/modules/auth/auth.repository';
import { AuthService } from '../../src/modules/auth/auth.service';
import type { AuthProvider } from '../../src/providers/auth';
import { LocalJwtAuthProvider } from '../../src/providers/auth/local-jwt.provider';
import { fakeDbContext, mockOf } from './fakes';

const provider = new LocalJwtAuthProvider('unit-test-secret-at-least-32-characters', '1h');

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'ada@example.com',
    name: 'Ada',
    passwordHash: null,
    externalId: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('AuthService', () => {
  let users: jest.Mocked<UserRepository>;
  let service: AuthService;

  beforeEach(() => {
    users = mockOf<UserRepository>('findByEmail', 'findById', 'findByExternalId', 'create');
    service = new AuthService(fakeDbContext(), users, provider);
  });

  it('registers a user with a hashed password and returns a token', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.create.mockImplementation(async (_db, data) => user({ ...(data as Partial<User>) }));

    const result = await service.register({
      email: 'ada@example.com',
      name: 'Ada',
      password: 'correct horse',
    });

    const created = users.create.mock.calls[0]![1];
    expect(created.passwordHash).toMatch(/^scrypt\$/);
    expect(created.passwordHash).not.toContain('correct horse');
    expect(result.user).not.toHaveProperty('passwordHash');
    await expect(provider.verifyToken(result.token)).resolves.toMatchObject({
      email: 'ada@example.com',
    });
  });

  it('rejects registration with an email that is taken', async () => {
    users.findByEmail.mockResolvedValue(user());
    await expect(
      service.register({ email: 'ada@example.com', name: 'Ada', password: 'whatever1' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('logs in with the right password and rejects the wrong one', async () => {
    users.findByEmail.mockResolvedValue(
      user({ passwordHash: await provider.hashPassword('right-password') }),
    );

    await expect(
      service.login({ email: 'ada@example.com', password: 'right-password' }),
    ).resolves.toHaveProperty('token');
    await expect(
      service.login({ email: 'ada@example.com', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects login for an unknown email with the same error', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(service.login({ email: 'x@example.com', password: 'x' })).rejects.toThrow(
      'Invalid email or password',
    );
  });

  it('resolves a local token to the user it was issued for', async () => {
    users.findById.mockResolvedValue(user());
    const token = provider.issueToken({ id: 'user-1', email: 'ada@example.com' });
    await expect(service.resolveUser(token)).resolves.toEqual({
      id: 'user-1',
      email: 'ada@example.com',
    });
  });

  it('creates a local user the first time a Cognito identity is seen', async () => {
    const cognito: AuthProvider = {
      kind: 'cognito',
      verifyToken: async () => ({ subject: 'cognito-sub', email: 'Grace@Example.com' }),
    };
    const cognitoService = new AuthService(fakeDbContext(), users, cognito);
    users.findByExternalId.mockResolvedValue(null);
    users.create.mockImplementation(async (_db, data) => user({ ...(data as Partial<User>) }));

    const resolved = await cognitoService.resolveUser('any-token');

    expect(users.create).toHaveBeenCalledWith(expect.anything(), {
      email: 'grace@example.com',
      name: 'Grace@Example.com',
      externalId: 'cognito-sub',
    });
    expect(resolved.email).toBe('grace@example.com');
  });

  it('refuses password registration when Cognito is the provider', async () => {
    const cognito: AuthProvider = { kind: 'cognito', verifyToken: jest.fn() };
    const cognitoService = new AuthService(fakeDbContext(), users, cognito);
    await expect(
      cognitoService.register({ email: 'a@b.co', name: 'A', password: 'password1' }),
    ).rejects.toMatchObject({ code: 'PASSWORD_AUTH_DISABLED' });
  });
});
