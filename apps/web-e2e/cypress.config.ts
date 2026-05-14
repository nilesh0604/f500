import { defineConfig } from 'cypress';
import { join } from 'path';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4200',
    specPattern: join(__dirname, 'src/**/*.cy.ts'),
    supportFile: join(__dirname, 'src/support/e2e.ts'),
    screenshotsFolder: join(
      __dirname,
      '../../dist/cypress/apps/web-e2e/screenshots'
    ),
    videosFolder: join(__dirname, '../../dist/cypress/apps/web-e2e/videos'),
    viewportWidth: 1280,
    viewportHeight: 720,
    defaultCommandTimeout: 8000,
    requestTimeout: 10000,
    retries: {
      runMode: 2,
      openMode: 0,
    },
    env: {
      apiBaseUrl: 'http://localhost:3001',
    },
  },
});
