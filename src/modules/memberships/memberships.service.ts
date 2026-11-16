import type { DbContext } from '../../common/db';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors';
import { toPage, toSkipTake } from '../../common/pagination';
import { Role } from '../../generated/prisma/client';
import type { MembershipRepository } from './memberships.repository';
import type { ListMembersQuery } from './memberships.schemas';

const RANK: Record<Role, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

export function hasRole(actual: Role, minimum: Role): boolean {
  return RANK[actual] >= RANK[minimum];
}

/** The caller's membership in the org being accessed (set by requireOrgRole). */
export type Actor = { orgId: string; userId: string; role: Role };

export class MembershipsService {
  constructor(
    private readonly db: DbContext,
    private readonly memberships: MembershipRepository,
  ) {}

  findMembership(orgId: string, userId: string) {
    return this.db.tenant(orgId, (db) => this.memberships.findByUser(db, orgId, userId));
  }

  async list(orgId: string, query: ListMembersQuery) {
    const { items, total } = await this.db.tenant(orgId, (db) =>
      this.memberships.listWithUsers(db, toSkipTake(query)),
    );
    return toPage(items, total, query);
  }

  changeRole(actor: Actor, memberId: string, newRole: Role) {
    return this.db.tenant(actor.orgId, async (db) => {
      const target = await this.memberships.findById(db, memberId);
      if (!target) throw new NotFoundError('Member');
      if (target.role === newRole) return target;

      if ((newRole === Role.OWNER || target.role === Role.OWNER) && actor.role !== Role.OWNER) {
        throw new ForbiddenError('Only owners can grant or remove the owner role');
      }
      if (
        target.role === Role.OWNER &&
        (await this.memberships.countByRole(db, Role.OWNER)) === 1
      ) {
        throw new ConflictError('An organisation must keep at least one owner');
      }
      return this.memberships.update(db, memberId, { role: newRole });
    });
  }

  /** Admins and owners can remove others; any member can remove themselves (leave). */
  remove(actor: Actor, memberId: string) {
    return this.db.tenant(actor.orgId, async (db) => {
      const target = await this.memberships.findById(db, memberId);
      if (!target) throw new NotFoundError('Member');

      const isSelf = target.userId === actor.userId;
      if (!isSelf && !hasRole(actor.role, Role.ADMIN)) {
        throw new ForbiddenError('Only admins can remove other members');
      }
      if (!isSelf && target.role === Role.OWNER && actor.role !== Role.OWNER) {
        throw new ForbiddenError('Only owners can remove an owner');
      }
      if (
        target.role === Role.OWNER &&
        (await this.memberships.countByRole(db, Role.OWNER)) === 1
      ) {
        throw new ConflictError('An organisation must keep at least one owner');
      }
      await this.memberships.delete(db, memberId);
    });
  }
}
