import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 60_000,
  use: {
    viewport: { width: 390, height: 844 },
    actionTimeout: 12000,
    launchOptions: { executablePath: process.env.RETIVVO_CHROMIUM },
  },
});
