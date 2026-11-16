import type { AuthUser } from '../../common/auth-middleware';
import type { DbContext } from '../../common/db';
import { AppError, ConflictError, NotFoundError, UnauthorizedError } from '../../common/errors';
import type { User } from '../../generated/prisma/client';
import {
  isPasswordProvider,
  type AuthProvider,
  type PasswordAuthProvider,
} from '../../providers/auth';
import type { UserRepository } from './auth.repository';
import type { LoginInput, RegisterInput } from './auth.schemas';

export type PublicUser = Pick<User, 'id' | 'email' | 'name' | 'createdAt'>;

export function toPublicUser(user: User): PublicUser {
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
}

export class AuthService {
  constructor(
    private readonly db: DbContext,
    private readonly users: UserRepository,
    private readonly provider: AuthProvider,
  ) {}

  async register(input: RegisterInput) {
    const provider = this.passwordProvider();
    const db = this.db.system();
    if (await this.users.findByEmail(db, input.email)) {
      throw new ConflictError('An account with this email already exists');
    }
    const user = await this.users.create(db, {
      email: input.email,
      name: input.name,
      passwordHash: await provider.hashPassword(input.password),
    });
    return { user: toPublicUser(user), token: provider.issueToken(user) };
  }

  async login(input: LoginInput) {
    const provider = this.passwordProvider();
    const user = await this.users.findByEmail(this.db.system(), input.email);
    // Same error for unknown email and wrong password, so the response does not reveal which.
    const valid = user?.passwordHash
      ? await provider.verifyPassword(input.password, user.passwordHash)
      : false;
    if (!user || !valid) throw new UnauthorizedError('Invalid email or password');
    return { user: toPublicUser(user), token: provider.issueToken(user) };
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(this.db.system(), userId);
    if (!user) throw new NotFoundError('User');
    return toPublicUser(user);
  }

  /** Used by the auth middleware: verifies the token and maps it to a user row. */
  resolveUser = async (token: string): Promise<AuthUser> => {
    const identity = await this.provider.verifyToken(token);
    const db = this.db.system();

    if (this.provider.kind === 'local') {
      // Local tokens carry our own user id as the subject.
      const user = await this.users.findById(db, identity.subject);
      if (!user) throw new UnauthorizedError();
      return { id: user.id, email: user.email };
    }

    // Cognito tokens carry Cognito's id; create the local user row on first sight.
    const user =
      (await this.users.findByExternalId(db, identity.subject)) ??
      (await this.users.create(db, {
        email: identity.email.toLowerCase(),
        name: identity.name ?? identity.email,
        externalId: identity.subject,
      }));
    return { id: user.id, email: user.email };
  };

  private passwordProvider(): PasswordAuthProvider {
    if (!isPasswordProvider(this.provider)) {
      throw new AppError(
        400,
        'PASSWORD_AUTH_DISABLED',
        `Password login is handled by ${this.provider.kind}, not this API`,
      );
    }
    return this.provider;
  }
}
