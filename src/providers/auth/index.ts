import type { Config } from '../../common/config';
import type { AuthProvider } from './auth-provider';
import { CognitoAuthProvider } from './cognito.provider';
import { LocalJwtAuthProvider } from './local-jwt.provider';

export * from './auth-provider';

// Factory: picks the auth implementation from config, so nothing else knows which one is in use.
export function createAuthProvider(config: Config): AuthProvider {
  if (config.AUTH_PROVIDER === 'cognito') {
    // Presence is guaranteed by the config schema when AUTH_PROVIDER=cognito.
    return new CognitoAuthProvider(config.COGNITO_USER_POOL_ID!, config.COGNITO_CLIENT_ID!);
  }
  return new LocalJwtAuthProvider(config.JWT_SECRET!, config.JWT_EXPIRES_IN);
}
