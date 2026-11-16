import type { Config } from 'jest';

const shared = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  clearMocks: true,
};

const config: Config = {
  projects: [
    { ...shared, displayName: 'unit', roots: ['<rootDir>/tests/unit'] },
    {
      ...shared,
      displayName: 'integration',
      roots: ['<rootDir>/tests/integration'],
      // Creates the test database if needed, applies migrations and seeds plans.
      globalSetup: '<rootDir>/tests/global-setup.ts',
    },
  ],
};

export default config;
