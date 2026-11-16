import { BaseRepository } from '../../common/base-repository';
import type { Db } from '../../common/db';
import type { Organisation, Prisma } from '../../generated/prisma/client';

export class OrganisationRepository extends BaseRepository<
  Organisation,
  Prisma.OrganisationUncheckedCreateInput,
  Prisma.OrganisationUncheckedUpdateInput,
  Prisma.OrganisationWhereInput
> {
  protected delegate(db: Db) {
    return db.organisation;
  }
}
