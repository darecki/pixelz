import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("loads without errors", async ({ page }) => {
    await expect(page).toHaveTitle(/Pixelz/i);
  });

  test("shows game options", async ({ page }) => {
    await expect(page.getByText("Pixelz")).toBeVisible();
    await expect(page.getByText("Reflex")).toBeVisible();
  });

  test("navigates to Pixelz game", async ({ page }) => {
    await page.getByText("Pixelz").click();
    await expect(page.getByText("Loading board")).toBeVisible();
  });

  test("navigates to Reflex game", async ({ page }) => {
    await page.getByText("Reflex").click();
    await expect(page.getByText("Reflex")).toBeVisible();
    await expect(page.getByText("Start")).toBeVisible();
  });

  test("navigates to leaderboard", async ({ page }) => {
    await page.getByRole("link", { name: /leaderboard/i }).click();
    await expect(page.getByText("Leaderboard")).toBeVisible();
  });
});

test.describe("Reflex game", () => {
  test("starts and shows countdown", async ({ page }) => {
    await page.goto("/play/reflex_easy");
    await expect(page.getByText("Start")).toBeVisible();
    await page.getByText("Start").click();
    await expect(page.getByText("3")).toBeVisible();
  });
});

test.describe("Accessibility", () => {
  test("home page has proper heading structure", async ({ page }) => {
    await page.goto("/");
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
  });

  test("buttons have accessible names", async ({ page }) => {
    await page.goto("/play/reflex_easy");
    const startButton = page.getByRole("button", { name: /start/i });
    await expect(startButton).toBeVisible();
  });
});
