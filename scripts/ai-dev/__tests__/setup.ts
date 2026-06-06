// Global test setup
import { jest } from '@jest/globals';

// Mock console methods to avoid noise in tests
const originalConsole = console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
} as Console;

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JIRA_BASE_URL = 'https://test.atlassian.net';
process.env.JIRA_EMAIL = 'test@example.com';
process.env.JIRA_API_TOKEN = 'test-token';

// Mock fs operations for test isolation
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs') as any;
  return {
    ...actualFs,
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    readdirSync: jest.fn(),
    promises: {
      ...actualFs.promises,
      readFile: jest.fn(),
      writeFile: jest.fn(),
      mkdir: jest.fn(),
      access: jest.fn(),
      unlink: jest.fn(),
    },
  };
});

// Mock child_process for safe testing
jest.mock('node:child_process', () => {
  const actualChildProcess = jest.requireActual('node:child_process') as any;
  return {
    ...actualChildProcess,
    execSync: jest.fn(),
    spawn: jest.fn(),
  };
});
