// Test environment: runs before every test file, before any app module reads config.
// Uses a separate database so tests never touch local development data.
Object.assign(process.env, {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://app:app@localhost:5440/saas_test',
  AUTH_PROVIDER: 'local',
  JWT_SECRET: 'test-secret-that-is-at-least-32-characters',
  JWT_EXPIRES_IN: '1h',
  PAYMENT_PROVIDER: 'fake',
  PAYMENT_WEBHOOK_SECRET: 'test-webhook-secret',
  CHECKOUT_SUCCESS_URL: 'http://localhost:3000/checkout/success',
  CHECKOUT_CANCEL_URL: 'http://localhost:3000/checkout/cancel',
  INVITE_TTL_HOURS: '168',
});
