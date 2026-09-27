import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/admin-ui",
  outputDir: "./test-results-admin",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3110",
    channel: process.platform === "darwin" ? "chrome" : undefined,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "tablet", use: { viewport: { width: 820, height: 1180 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "node tests/admin-ui/server.mjs",
    url: "http://127.0.0.1:3110/admin/login",
    timeout: 120000,
    reuseExistingServer: false,
  },
});
