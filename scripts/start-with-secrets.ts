/**
 * Container entrypoint. Fills in the environment, then starts the API.
 *
 *   SECRETS_SOURCE=local  load variables from .env (if present) and the existing environment
 *   SECRETS_SOURCE=aws    fetch one JSON secret (SECRET_ID) from AWS Secrets Manager and copy
 *                         its keys into the environment
 *
 * Either way, src/common/config.ts then validates every variable, so the app behaves the same
 * whichever source the values came from.
 */
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { config as loadDotenv } from 'dotenv';

/** Keys the AWS secret must contain. Non-sensitive settings come from the task definition. */
export const REQUIRED_SECRET_KEYS = ['DATABASE_URL', 'JWT_SECRET', 'PAYMENT_WEBHOOK_SECRET'];

/** The one SDK method used, so tests can pass a mock client. */
export type SecretsClient = Pick<SecretsManagerClient, 'send'>;

export async function loadSecrets(env: NodeJS.ProcessEnv, client?: SecretsClient): Promise<void> {
  const source = env.SECRETS_SOURCE ?? 'local';

  if (source === 'local') {
    loadDotenv({ processEnv: env as Record<string, string>, quiet: true });
    return;
  }
  if (source !== 'aws') {
    throw new Error(`SECRETS_SOURCE must be "local" or "aws", got "${source}"`);
  }

  const secretId = env.SECRET_ID;
  if (!secretId) throw new Error('SECRET_ID is required when SECRETS_SOURCE=aws');

  const secrets = client ?? new SecretsManagerClient({ region: env.AWS_REGION });
  let secretString: string | undefined;
  try {
    const response = await secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
    secretString = response.SecretString;
  } catch (err) {
    throw new Error(`Could not read secret "${secretId}": ${(err as Error).message}`);
  }
  if (!secretString) throw new Error(`Secret "${secretId}" has no string value`);

  let values: unknown;
  try {
    values = JSON.parse(secretString);
  } catch {
    throw new Error(`Secret "${secretId}" is not valid JSON`);
  }
  if (typeof values !== 'object' || values === null || Array.isArray(values)) {
    throw new Error(`Secret "${secretId}" must be a JSON object of key/value pairs`);
  }

  const record = values as Record<string, unknown>;
  const missing = REQUIRED_SECRET_KEYS.filter((key) => !record[key]);
  if (missing.length > 0) {
    throw new Error(`Secret "${secretId}" is missing required keys: ${missing.join(', ')}`);
  }
  for (const [key, value] of Object.entries(record)) {
    env[key] = String(value);
  }
}

async function main() {
  try {
    await loadSecrets(process.env);
  } catch (err) {
    console.error(`[start-with-secrets] ${(err as Error).message}`);
    process.exit(1);
  }
  // Imported only now: config is read when the server module loads.
  const { startServer } = await import('../src/server');
  startServer();
}

if (require.main === module) {
  void main();
}
