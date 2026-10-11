import { defineConfig, devices } from "@playwright/test";
const apiPort = process.env.TEST_API_PORT || "8000";
const webPort = process.env.TEST_WEB_PORT || "3000";
const baseURL = `http://127.0.0.1:${webPort}`;
export default defineConfig({
  testDir: "./e2e", timeout: 45000, workers: 1,
  expect: { timeout: 15000 },
  use: { baseURL, trace: "retain-on-failure", launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.RENDEZVOUS_EXTERNAL_TEST_SERVERS === "1" ? undefined : [
    { command: `../backend/.venv/bin/uvicorn tests.browser_server:app --app-dir ../backend --port ${apiPort} --ws-max-size 16384`, url: `http://127.0.0.1:${apiPort}/health`, env: { ALLOWED_ORIGINS: baseURL }, reuseExistingServer: false },
    { command: `npm run dev -- --hostname 127.0.0.1 --port ${webPort}`, url: baseURL, env: { NEXT_PUBLIC_BACKEND_API_URL: `http://127.0.0.1:${apiPort}` }, reuseExistingServer: false, timeout: 120000 },
  ],
});
