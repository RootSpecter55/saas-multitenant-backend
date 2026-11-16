import { ConflictError, ForbiddenError } from '../../src/common/errors';
import type { Membership, Role } from '../../src/generated/prisma/client';
import type { MembershipRepository } from '../../src/modules/memberships/memberships.repository';
import { hasRole, MembershipsService } from '../../src/modules/memberships/memberships.service';
import { fakeDbContext, mockOf } from './fakes';

function membership(id: string, userId: string, role: Role): Membership {
  return { id, orgId: 'org-1', userId, role, createdAt: new Date() };
}

describe('hasRole', () => {
  it('ranks owner > admin > member', () => {
    expect(hasRole('OWNER', 'ADMIN')).toBe(true);
    expect(hasRole('ADMIN', 'ADMIN')).toBe(true);
    expect(hasRole('MEMBER', 'ADMIN')).toBe(false);
  });
});

describe('MembershipsService', () => {
  let repo: jest.Mocked<MembershipRepository>;
  let service: MembershipsService;
  const owner = { orgId: 'org-1', userId: 'u-owner', role: 'OWNER' as const };
  const admin = { orgId: 'org-1', userId: 'u-admin', role: 'ADMIN' as const };
  const member = { orgId: 'org-1', userId: 'u-member', role: 'MEMBER' as const };

  beforeEach(() => {
    repo = mockOf<MembershipRepository>('findById', 'countByRole', 'update', 'delete');
    service = new MembershipsService(fakeDbContext(), repo);
  });

  describe('changeRole', () => {
    it('lets an admin change a member to admin', async () => {
      repo.findById.mockResolvedValue(membership('m1', 'u-x', 'MEMBER'));
      await service.changeRole(admin, 'm1', 'ADMIN');
      expect(repo.update).toHaveBeenCalledWith(expect.anything(), 'm1', { role: 'ADMIN' });
    });

    it('stops an admin granting the owner role', async () => {
      repo.findById.mockResolvedValue(membership('m1', 'u-x', 'MEMBER'));
      await expect(service.changeRole(admin, 'm1', 'OWNER')).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('stops demoting the last owner', async () => {
      repo.findById.mockResolvedValue(membership('m1', 'u-owner', 'OWNER'));
      repo.countByRole.mockResolvedValue(1);
      await expect(service.changeRole(owner, 'm1', 'ADMIN')).rejects.toBeInstanceOf(ConflictError);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('allows demoting an owner when another owner remains', async () => {
      repo.findById.mockResolvedValue(membership('m1', 'u-owner', 'OWNER'));
      repo.countByRole.mockResolvedValue(2);
      await service.changeRole(owner, 'm1', 'ADMIN');
      expect(repo.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('lets a member remove themselves', async () => {
      repo.findById.mockResolvedValue(membership('m1', 'u-member', 'MEMBER'));
      await service.remove(member, 'm1');
      expect(repo.delete).toHaveBeenCalledWith(expect.anything(), 'm1');
    });

    it('stops a member removing someone else', async () => {
      repo.findById.mockResolvedValue(membership('m2', 'u-other', 'MEMBER'));
      await expect(service.remove(member, 'm2')).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('stops an admin removing an owner', async () => {
      repo.findById.mockResolvedValue(membership('m3', 'u-owner', 'OWNER'));
      await expect(service.remove(admin, 'm3')).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
