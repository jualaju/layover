import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", timeout: 45000, workers: 1,
  expect: { timeout: 15000 },
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure", launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.RENDEZVOUS_EXTERNAL_TEST_SERVERS === "1" ? undefined : [
    { command: "../backend/.venv/bin/uvicorn tests.browser_server:app --app-dir ../backend --port 8000 --ws-max-size 16384", url: "http://127.0.0.1:8000/health", reuseExistingServer: false },
    { command: "npm run dev -- --hostname 127.0.0.1", url: "http://127.0.0.1:3000", reuseExistingServer: false, timeout: 120000 },
  ],
});
