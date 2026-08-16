import { test, expect } from '@playwright/test';

test.describe('Credit & Billing System E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'test@genova-ai.tech');
    await page.fill('[data-testid="password"]', 'TestPassword123!');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
  });

  test('Credit balance displays correctly', async ({ page }) => {
    await page.goto('/billing');
    await expect(page.locator('[data-testid="credit-balance"]')).toBeVisible();

    const balance = await page.locator('[data-testid="credit-balance"]').textContent();
    expect(balance).toMatch(/\d+[\.\,]?\d*\s*(crédits|FCFA|USD|€)/i);
  });

  test('Credit transaction history loads', async ({ page }) => {
    await page.goto('/billing/history');
    await expect(page.locator('[data-testid="transactions-table"]')).toBeVisible();

    const rows = await page.locator('[data-testid="transaction-row"]').count();
    expect(rows).toBeGreaterThanOrEqual(0);
  });

  test('Subscription plan upgrade flow', async ({ page }) => {
    await page.goto('/billing/plans');

    // Vérifier que les plans sont affichés
    await expect(page.locator('[data-testid="plan-card"]').first()).toBeVisible();

    // Cliquer sur "Upgrade" pour le plan Pro
    const upgradeButton = page.locator('[data-testid="upgrade-button"]').first();
    if (await upgradeButton.isVisible()) {
      await upgradeButton.click();
      await page.waitForURL(/\/billing\/checkout/);
      await expect(page.locator('[data-testid="checkout-form"]')).toBeVisible();
    }
  });

  test('Credit purchase with Orange Money / Mobile Money', async ({ page }) => {
    await page.goto('/billing');
    await page.click('[data-testid="buy-credits-button"]');

    // Vérifier les options de paiement mobile
    await expect(page.locator('[data-testid="mobile-money-option"]')).toBeVisible();

    // Sélectionner Orange Money
    await page.click('[data-testid="orange-money-option"]');
    await page.fill('[data-testid="amount-input"]', '5000');
    await page.click('[data-testid="confirm-payment-button"]');

    await expect(page.locator('[data-testid="payment-instructions"]')).toBeVisible();
  });

  test('Invoice download', async ({ page }) => {
    await page.goto('/billing/invoices');
    await expect(page.locator('[data-testid="invoices-list"]')).toBeVisible();

    const downloadButton = page.locator('[data-testid="download-invoice"]').first();
    if (await downloadButton.isVisible()) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        downloadButton.click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/\.pdf/i);
    }
  });

  test('Usage statistics dashboard', async ({ page }) => {
    await page.goto('/billing/usage');
    await expect(page.locator('[data-testid="usage-chart"]')).toBeVisible();

    // Vérifier les métriques
    await expect(page.locator('[data-testid="total-tokens"]')).toBeVisible();
    await expect(page.locator('[data-testid="total-cost"]')).toBeVisible();
    await expect(page.locator('[data-testid="api-calls-count"]')).toBeVisible();

    // Vérifier les filtres de date
    await expect(page.locator('[data-testid="date-filter"]')).toBeVisible();
  });

  test('Credit alerts and notifications', async ({ page }) => {
    await page.goto('/billing/alerts');
    await expect(page.locator('[data-testid="credit-alert-settings"]')).toBeVisible();

    // Configurer un seuil d\'alerte
    await page.fill('[data-testid="threshold-input"]', '100');
    await page.click('[data-testid="save-alert-button"]');
    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible();
  });

  test('Payment method management', async ({ page }) => {
    await page.goto('/billing/payment-methods');
    await expect(page.locator('[data-testid="payment-methods-list"]')).toBeVisible();

    // Ajouter une méthode de paiement
    await page.click('[data-testid="add-payment-method-button"]');
    await expect(page.locator('[data-testid="payment-form"]')).toBeVisible();
  });
});
