import { test, expect } from "@playwright/test";

test.describe("Auth Flow", () => {
  const TEST_USER = {
    name: "Test User",
    email: `test-${Date.now()}@example.com`,
    password: "StrongP@ss1",
  };

  test("should display login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1, h2").first()).toBeVisible();
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
  });

  test("should show validation errors on empty form", async ({ page }) => {
    await page.goto("/login");
    await page.locator('button[type="submit"]').click();
    await expect(page.locator("text=requis|required|Email|Mot de passe")).toBeVisible();
  });

  test("should register a new user", async ({ page }) => {
    await page.goto("/register");
    await page.locator('input[name="name"]').fill(TEST_USER.name);
    await page.locator('input[name="email"]').fill(TEST_USER.email);
    await page.locator('input[name="password"]').fill(TEST_USER.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await expect(page).toHaveURL(/dashboard/);
  });

  test("should reject invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill("wrong@example.com");
    await page.locator('input[name="password"]').fill("WrongPassword1");
    await page.locator('button[type="submit"]').click();
    await expect(page.locator("text=invalide|Identifiants")).toBeVisible();
  });

  test("should redirect unauthenticated users to login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/login|auth/, { timeout: 10000 });
    await expect(page).toHaveURL(/login/);
  });
});

test.describe("Agent Chat", () => {
  test("should display agent page", async ({ page }) => {
    await page.goto("/agent");
    await expect(page.locator("text=Agent|Genova|Chat|Assistant")).toBeVisible();
  });
});

test.describe("Security Headers", () => {
  test("should have CSP headers", async ({ page }) => {
    const response = await page.goto("/");
    expect(response!.headers()["content-security-policy"]).toBeDefined();
  });
});
