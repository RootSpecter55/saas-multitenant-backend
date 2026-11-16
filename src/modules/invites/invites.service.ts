import { createHash, randomBytes } from 'node:crypto';
import type { AuthUser } from '../../common/auth-middleware';
import type { DbContext } from '../../common/db';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../common/errors';
import { toPage, toSkipTake } from '../../common/pagination';
import type { Invite } from '../../generated/prisma/client';
import type { UserRepository } from '../auth/auth.repository';
import type { Actor } from '../memberships/memberships.service';
import type { MembershipRepository } from '../memberships/memberships.repository';
import type { InviteRepository } from './invites.repository';
import type { CreateInviteInput, ListInvitesQuery } from './invites.schemas';

export type InviteStatus = 'pending' | 'accepted' | 'expired';

/** Only the SHA-256 of a token is stored, so a database leak does not leak usable invite links. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function inviteStatus(invite: Invite, now = new Date()): InviteStatus {
  if (invite.acceptedAt) return 'accepted';
  return invite.expiresAt <= now ? 'expired' : 'pending';
}

function toView(invite: Invite) {
  const { tokenHash: _omit, ...rest } = invite;
  return { ...rest, status: inviteStatus(invite) };
}

export class InvitesService {
  constructor(
    private readonly db: DbContext,
    private readonly invites: InviteRepository,
    private readonly memberships: MembershipRepository,
    private readonly users: UserRepository,
    private readonly ttlHours: number,
  ) {}

  /** Returns the raw token once. Only its hash is stored. */
  create(actor: Actor, input: CreateInviteInput) {
    return this.db.tenant(actor.orgId, async (db) => {
      const existingUser = await this.users.findByEmail(db, input.email);
      if (existingUser && (await this.memberships.findByUser(db, actor.orgId, existingUser.id))) {
        throw new ConflictError('This person is already a member');
      }
      if (await this.invites.findPendingByEmail(db, input.email, new Date())) {
        throw new ConflictError('A pending invite already exists for this email');
      }

      const token = randomBytes(32).toString('base64url');
      const invite = await this.invites.create(db, {
        orgId: actor.orgId,
        email: input.email,
        role: input.role,
        tokenHash: hashToken(token),
        invitedById: actor.userId,
        expiresAt: new Date(Date.now() + this.ttlHours * 60 * 60 * 1000),
      });
      return { invite: toView(invite), token };
    });
  }

  async list(orgId: string, query: ListInvitesQuery) {
    const { items, total } = await this.db.tenant(orgId, (db) =>
      this.invites.list(db, { ...toSkipTake(query), orderBy: { createdAt: 'desc' } }),
    );
    return toPage(items.map(toView), total, query);
  }

  revoke(orgId: string, inviteId: string) {
    return this.db.tenant(orgId, async (db) => {
      const invite = await this.invites.findById(db, inviteId);
      if (!invite) throw new NotFoundError('Invite');
      if (invite.acceptedAt) throw new ConflictError('Invite has already been accepted');
      await this.invites.delete(db, inviteId);
    });
  }

  /** Turns a valid invite into a membership. The invite email must match the caller's email. */
  accept(orgId: string, user: AuthUser, token: string) {
    return this.db.tenant(orgId, async (db) => {
      const invite = await this.invites.findByTokenHash(db, hashToken(token));
      if (!invite) throw new NotFoundError('Invite');

      const status = inviteStatus(invite);
      if (status === 'accepted') throw new ConflictError('Invite has already been used');
      if (status === 'expired') throw new AppError(410, 'INVITE_EXPIRED', 'Invite has expired');
      if (invite.email !== user.email) {
        throw new ForbiddenError('This invite was sent to a different email address');
      }
      if (await this.memberships.findByUser(db, orgId, user.id)) {
        throw new ConflictError('You are already a member');
      }

      const membership = await this.memberships.create(db, {
        orgId,
        userId: user.id,
        role: invite.role,
      });
      await this.invites.update(db, invite.id, { acceptedAt: new Date() });
      return membership;
    });
  }
}
