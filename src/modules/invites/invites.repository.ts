import { BaseRepository } from '../../common/base-repository';
import type { Db } from '../../common/db';
import type { Invite, Prisma } from '../../generated/prisma/client';

export class InviteRepository extends BaseRepository<
  Invite,
  Prisma.InviteUncheckedCreateInput,
  Prisma.InviteUncheckedUpdateInput,
  Prisma.InviteWhereInput
> {
  protected delegate(db: Db) {
    return db.invite;
  }

  findByTokenHash(db: Db, tokenHash: string) {
    return db.invite.findUnique({ where: { tokenHash } });
  }

  findPendingByEmail(db: Db, email: string, now: Date) {
    return db.invite.findFirst({ where: { email, acceptedAt: null, expiresAt: { gt: now } } });
  }

  countPending(db: Db, now: Date) {
    return db.invite.count({ where: { acceptedAt: null, expiresAt: { gt: now } } });
  }
}
