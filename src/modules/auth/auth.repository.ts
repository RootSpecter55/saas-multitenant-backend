import { BaseRepository } from '../../common/base-repository';
import type { Db } from '../../common/db';
import type { Prisma, User } from '../../generated/prisma/client';

export class UserRepository extends BaseRepository<
  User,
  Prisma.UserUncheckedCreateInput,
  Prisma.UserUncheckedUpdateInput,
  Prisma.UserWhereInput
> {
  protected delegate(db: Db) {
    return db.user;
  }

  findByEmail(db: Db, email: string) {
    return db.user.findUnique({ where: { email } });
  }

  findByExternalId(db: Db, externalId: string) {
    return db.user.findUnique({ where: { externalId } });
  }
}
