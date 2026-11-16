import { loadConfig } from '../../src/common/config';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
  PAYMENT_WEBHOOK_SECRET: 'secret',
  CHECKOUT_SUCCESS_URL: 'http://localhost/s',
  CHECKOUT_CANCEL_URL: 'http://localhost/c',
};

describe('loadConfig', () => {
  it('applies defaults to a minimal valid environment', () => {
    const config = loadConfig(base);
    expect(config).toMatchObject({ PORT: 3000, AUTH_PROVIDER: 'local', PAYMENT_PROVIDER: 'fake' });
  });

  it('lists every missing or invalid variable in one error', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/Invalid configuration/);
    try {
      loadConfig({ PORT: 'abc' });
    } catch (err) {
      for (const key of [
        'PORT',
        'DATABASE_URL',
        'PAYMENT_WEBHOOK_SECRET',
        'CHECKOUT_SUCCESS_URL',
      ]) {
        expect((err as Error).message).toContain(`- ${key}:`);
      }
    }
  });

  it('requires provider-specific variables only for the chosen provider', () => {
    expect(() => loadConfig({ ...base, AUTH_PROVIDER: 'cognito' })).toThrow(
      /COGNITO_USER_POOL_ID: required when AUTH_PROVIDER=cognito/,
    );
    expect(() => loadConfig({ ...base, PAYMENT_PROVIDER: 'stripe' })).toThrow(
      /STRIPE_SECRET_KEY: required when PAYMENT_PROVIDER=stripe/,
    );
  });
});
