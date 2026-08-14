// ============================================================
// E2E — Authentication flows (register, login, refresh, logout)
// ============================================================

import { test, expect } from '@playwright/test';

const TEST_USER = {
  name: 'Test E2E',
  email: `e2e_${Date.now()}@test.gen3ia.ai`,
  password: 'Str0ng!Pass123',
};

test.describe('🔐 Authentication', () => {

  test('should register a new user and redirect to dashboard', async ({ page }) => {
    await page.goto('/auth/register');

    await page.fill('[name="name"]', TEST_USER.name);
    await page.fill('[name="email"]', TEST_USER.email);
    await page.fill('[name="password"]', TEST_USER.password);
    await page.fill('[name="confirmPassword"]', TEST_USER.password);

    await page.click('button[type="submit"]');

    // Should redirect to dashboard or show success
    await expect(page).toHaveURL(/\/dashboard|\/login/, { timeout: 10000 });
  });

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/auth/login');

    await page.fill('[name="email"]', TEST_USER.email);
    await page.fill('[name="password"]', TEST_USER.password);

    await page.click('button[type="submit"]');

    // Wait for dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // Should see user name
    await expect(page.locator('text=Test E2E')).toBeVisible({ timeout: 5000 });
  });

  test('should show error on invalid login', async ({ page }) => {
    await page.goto('/auth/login');

    await page.fill('[name="email"]', 'wrong@email.com');
    await page.fill('[name="password"]', 'WrongPass123!');

    await page.click('button[type="submit"]');

    // Should show error message
    await expect(page.locator('text=incorrect|invalide|erreur')).toBeVisible({ timeout: 5000 });
  });

  test('should logout and redirect to login', async ({ page }) => {
    // First login
    await page.goto('/auth/login');
    await page.fill('[name="email"]', TEST_USER.email);
    await page.fill('[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // Click logout
    await page.click('[data-testid="logout-button"]');

    // Should redirect to login
    await expect(page).toHaveURL(/\/auth\/login|\/login/, { timeout: 10000 });
  });

  test('should reject weak passwords on registration', async ({ page }) => {
    await page.goto('/auth/register');

    await page.fill('[name="password"]', '123');
    await page.fill('[name="confirmPassword"]', '123');

    await page.click('button[type="submit"]');

    // Should show validation error
    await expect(page.locator('text=Minimum|caractères|8')).toBeVisible({ timeout: 3000 });
  });
});
