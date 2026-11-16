import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { AuthProvider, VerifiedIdentity } from './auth-provider';

/**
 * Verifies Cognito ID tokens against the user pool's public keys (fetched and cached by aws-jwt-verify).
 * ID tokens are used because Cognito access tokens do not carry the email claim.
 * Not covered by the test suite: it needs a real user pool.
 */
export class CognitoAuthProvider implements AuthProvider {
  readonly kind = 'cognito' as const;
  private readonly verifier;

  constructor(userPoolId: string, clientId: string) {
    this.verifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: 'id' });
  }

  async verifyToken(token: string): Promise<VerifiedIdentity> {
    const payload = await this.verifier.verify(token);
    if (typeof payload.email !== 'string') throw new Error('Cognito token has no email claim');
    const name = typeof payload.name === 'string' ? payload.name : undefined;
    return { subject: payload.sub, email: payload.email, name };
  }
}
