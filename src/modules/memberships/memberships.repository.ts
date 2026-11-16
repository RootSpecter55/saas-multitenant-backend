import { BaseRepository } from '../../common/base-repository';
import type { Db } from '../../common/db';
import type { Membership, Prisma, Role } from '../../generated/prisma/client';

export class MembershipRepository extends BaseRepository<
  Membership,
  Prisma.MembershipUncheckedCreateInput,
  Prisma.MembershipUncheckedUpdateInput,
  Prisma.MembershipWhereInput
> {
  protected delegate(db: Db) {
    return db.membership;
  }

  findByUser(db: Db, orgId: string, userId: string) {
    return db.membership.findUnique({ where: { orgId_userId: { orgId, userId } } });
  }

  /** Members with their user's public fields. RLS limits rows to the current org. */
  async listWithUsers(db: Db, { skip, take }: { skip: number; take: number }) {
    const items = await db.membership.findMany({
      skip,
      take,
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    const total = await db.membership.count();
    return { items, total };
  }

  countAll(db: Db) {
    return db.membership.count();
  }

  countByRole(db: Db, role: Role) {
    return db.membership.count({ where: { role } });
  }

  /**
   * Cross-tenant read: every org the user belongs to. Must run on the system handle
   * (outside a tenant transaction); filtering by userId keeps it to the caller's own rows.
   */
  async listOrgsForUser(db: Db, userId: string, { skip, take }: { skip: number; take: number }) {
    const where = { userId };
    const items = await db.membership.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'asc' },
      include: { organisation: true },
    });
    const total = await db.membership.count({ where });
    return { items, total };
  }
}
