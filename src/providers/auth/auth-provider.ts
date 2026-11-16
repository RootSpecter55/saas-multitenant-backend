/** What a verified token tells us about the caller. */
export type VerifiedIdentity = { subject: string; email: string; name?: string };

/** Verifies access tokens. Implementations: local JWT (default) and AWS Cognito. */
export interface AuthProvider {
  readonly kind: 'local' | 'cognito';
  verifyToken(token: string): Promise<VerifiedIdentity>;
}

/** The local provider also owns passwords and issues tokens. Cognito does both on AWS's side. */
export interface PasswordAuthProvider extends AuthProvider {
  readonly kind: 'local';
  issueToken(user: { id: string; email: string }): string;
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
}

export function isPasswordProvider(provider: AuthProvider): provider is PasswordAuthProvider {
  return provider.kind === 'local';
}
