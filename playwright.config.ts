import { defineConfig } from "@playwright/test";

const port = 4499;

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // Real Chrome has the H.264 encoder. Set CLIPAI_E2E_CHANNEL=chromium to use the bundled browser.
    channel: process.env.CLIPAI_E2E_CHANNEL ?? "chrome",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `node packages/server/dist/cli.js --port ${port} --projects test-results/e2e-projects`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
  },
});
