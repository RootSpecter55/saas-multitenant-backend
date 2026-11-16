import { ConflictError, ForbiddenError } from '../../src/common/errors';
import type { Invite } from '../../src/generated/prisma/client';
import type { UserRepository } from '../../src/modules/auth/auth.repository';
import type { InviteRepository } from '../../src/modules/invites/invites.repository';
import { hashToken, inviteStatus, InvitesService } from '../../src/modules/invites/invites.service';
import type { MembershipRepository } from '../../src/modules/memberships/memberships.repository';
import { fakeDbContext, mockOf } from './fakes';

const actor = { orgId: 'org-1', userId: 'u-admin', role: 'ADMIN' as const };
const carol = { id: 'u-carol', email: 'carol@example.com' };

function invite(overrides: Partial<Invite> = {}): Invite {
  return {
    id: 'inv-1',
    orgId: 'org-1',
    email: 'carol@example.com',
    role: 'MEMBER',
    tokenHash: hashToken('the-token'),
    invitedById: 'u-admin',
    expiresAt: new Date(Date.now() + 60_000),
    acceptedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('inviteStatus', () => {
  it('derives pending, accepted and expired', () => {
    expect(inviteStatus(invite())).toBe('pending');
    expect(inviteStatus(invite({ acceptedAt: new Date() }))).toBe('accepted');
    expect(inviteStatus(invite({ expiresAt: new Date(Date.now() - 1) }))).toBe('expired');
  });
});

describe('InvitesService', () => {
  let invites: jest.Mocked<InviteRepository>;
  let memberships: jest.Mocked<MembershipRepository>;
  let users: jest.Mocked<UserRepository>;
  let service: InvitesService;

  beforeEach(() => {
    invites = mockOf<InviteRepository>('create', 'findPendingByEmail', 'findByTokenHash', 'update');
    memberships = mockOf<MembershipRepository>('findByUser', 'create');
    users = mockOf<UserRepository>('findByEmail');
    service = new InvitesService(fakeDbContext(), invites, memberships, users, 24);
  });

  it('stores a hash of the token and returns the raw token once', async () => {
    users.findByEmail.mockResolvedValue(null);
    invites.findPendingByEmail.mockResolvedValue(null);
    invites.create.mockImplementation(async (_db, data) => invite(data as Partial<Invite>));

    const { token, invite: view } = await service.create(actor, {
      email: 'carol@example.com',
      role: 'MEMBER',
    });

    expect(invites.create.mock.calls[0]![1].tokenHash).toBe(hashToken(token));
    expect(view).not.toHaveProperty('tokenHash');
  });

  it('refuses to invite an existing member', async () => {
    users.findByEmail.mockResolvedValue({ id: 'u-carol' } as never);
    memberships.findByUser.mockResolvedValue({ id: 'm1' } as never);
    await expect(
      service.create(actor, { email: 'carol@example.com', role: 'MEMBER' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('accepts by turning the invite into a membership with the invited role', async () => {
    invites.findByTokenHash.mockResolvedValue(invite({ role: 'ADMIN' }));
    memberships.findByUser.mockResolvedValue(null);

    await service.accept('org-1', carol, 'the-token');

    expect(memberships.create).toHaveBeenCalledWith(expect.anything(), {
      orgId: 'org-1',
      userId: 'u-carol',
      role: 'ADMIN',
    });
    expect(invites.update).toHaveBeenCalledWith(expect.anything(), 'inv-1', {
      acceptedAt: expect.any(Date),
    });
  });

  it('rejects accepting with a different email', async () => {
    invites.findByTokenHash.mockResolvedValue(invite());
    await expect(
      service.accept('org-1', { id: 'u-x', email: 'mallory@example.com' }, 'the-token'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects an expired invite with 410', async () => {
    invites.findByTokenHash.mockResolvedValue(invite({ expiresAt: new Date(Date.now() - 1) }));
    await expect(service.accept('org-1', carol, 'the-token')).rejects.toMatchObject({
      status: 410,
    });
  });
});
