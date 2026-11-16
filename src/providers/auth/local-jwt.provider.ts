import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { PasswordAuthProvider, VerifiedIdentity } from './auth-provider';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;
const KEY_LENGTH = 64;

/** Issues and verifies HS256 JWTs; hashes passwords with scrypt (built into Node, no native deps). */
export class LocalJwtAuthProvider implements PasswordAuthProvider {
  readonly kind = 'local' as const;

  constructor(
    private readonly secret: string,
    private readonly expiresIn: string,
  ) {}

  issueToken(user: { id: string; email: string }): string {
    const options = {
      subject: user.id,
      expiresIn: this.expiresIn,
      algorithm: 'HS256',
    } as SignOptions;
    return jwt.sign({ email: user.email }, this.secret, options);
  }

  async verifyToken(token: string): Promise<VerifiedIdentity> {
    const payload = jwt.verify(token, this.secret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload.sub || typeof payload.email !== 'string') {
      throw new Error('Token is missing required claims');
    }
    return { subject: payload.sub, email: payload.email };
  }

  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = await scrypt(password, salt, KEY_LENGTH);
    return ['scrypt', salt.toString('base64'), hash.toString('base64')].join('$');
  }

  async verifyPassword(password: string, stored: string): Promise<boolean> {
    const [scheme, saltB64, hashB64] = stored.split('$');
    if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
    return timingSafeEqual(actual, expected);
  }
}
