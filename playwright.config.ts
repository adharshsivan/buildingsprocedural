import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: { timeout: 20000 },
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 1000 },
    launchOptions: { args: ['--no-sandbox', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npm run dev -- --host 0.0.0.0',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30000,
  },
});