import { test, expect } from "@playwright/test";

test("two browser sessions coordinate a meetup and confirm a delay-driven switch", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // External map tile rendering is verified separately. E2E stays network-independent.
  for (const context of [hostContext, guestContext]) await context.route("https://tile.openstreetmap.org/**", route => route.abort());
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const errors: string[] = [];
  host.on("pageerror", error => errors.push(error.message));
  guest.on("pageerror", error => errors.push(error.message));
  await host.goto("/");
  await host.getByRole("button", { name: /Plan a meetup/ }).click();
  await host.getByLabel("Your name").fill("Alex");
  await host.getByRole("button", { name: /Create my room/ }).click();
  await expect(host).toHaveURL(/\/room\/[A-F0-9]{8}/);
  const roomUrl = host.url();
  await host.getByRole("button", { name: /Add my starting point/ }).click();
  await host.locator(".setup-map .leaflet-container").click({ position: { x: 200, y: 130 } });
  await host.getByRole("button", { name: /Save my starting point/ }).click();
  await expect(host.getByRole("dialog")).toHaveCount(0);
  await guest.goto(roomUrl);
  await guest.getByLabel("Your name").fill("Sam");
  await guest.getByRole("button", { name: /Join this meetup/ }).click();
  await guest.getByRole("button", { name: /Add my starting point/ }).click();
  await guest.locator(".setup-map .leaflet-container").click({ position: { x: 140, y: 110 } });
  await guest.getByRole("button", { name: /Save my starting point/ }).click();
  await expect(host.getByText("Sam", { exact: true })).toBeVisible();
  await host.getByRole("button", { name: /Find meeting points/ }).click();
  await expect(host.locator(".recommendation h2")).toHaveText("Test A");
  await expect(guest.locator(".recommendation h2")).toHaveText("Test A");
  const slider = host.getByRole("slider", { name: /Simulate/ });
  await slider.focus();
  await slider.press("Home");
  for (let i = 0; i < 90; i++) await slider.press("ArrowRight");
  await expect(guest.locator(".proposal h3")).toHaveText("Switch to Test B?");
  await expect(host.locator(".recommendation h2")).toHaveText("Test A");
  await host.getByRole("button", { name: "Approve switch" }).click();
  await guest.getByRole("button", { name: "Approve switch" }).click();
  await expect(host.locator(".recommendation h2")).toHaveText("Test B");
  await expect(guest.locator(".recommendation h2")).toHaveText("Test B");
  await guest.reload();
  await expect(guest.locator(".recommendation h2")).toHaveText("Test B");
  expect(await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await hostContext.close(); await guestContext.close();
});

test("landing page is responsive and modal supports keyboard dismissal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Different starts/ })).toBeVisible();
  await page.getByRole("button", { name: /Plan a meetup/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
