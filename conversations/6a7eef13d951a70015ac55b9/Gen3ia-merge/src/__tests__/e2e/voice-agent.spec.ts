import { test, expect } from '@playwright/test';

test.describe('Voice Agent E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'test@genova-ai.tech');
    await page.fill('[data-testid="password"]', 'TestPassword123!');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
  });

  test('Voice configuration panel loads correctly', async ({ page }) => {
    await page.goto('/voice');
    await expect(page.locator('[data-testid="voice-config"]')).toBeVisible();
    await expect(page.locator('[data-testid="tts-provider-select"]')).toBeVisible();
    await expect(page.locator('[data-testid="voice-select"]')).toBeVisible();

    // Vérifier les providers disponibles
    const options = await page.locator('[data-testid="tts-provider-select"] option').allTextContents();
    expect(options.length).toBeGreaterThanOrEqual(1);
  });

  test('Voice call simulation', async ({ page }) => {
    await page.goto('/voice');
    await page.fill('[data-testid="phone-input"]', '+237671234567');
    await page.click('[data-testid="start-call-button"]');

    // Vérifier que l'appel est initié
    await expect(page.locator('[data-testid="call-status"]')).toContainText(/ringing|connecting|active/);
  });

  test('TTS test panel generates speech', async ({ page }) => {
    await page.goto('/voice/tts-test');
    await page.fill('[data-testid="tts-text-input"]', 'Bonjour, je suis Genova, votre assistant IA.');
    await page.click('[data-testid="tts-generate-button"]');

    await expect(page.locator('[data-testid="tts-audio-player"]')).toBeVisible({ timeout: 30000 });
  });

  test('Voice history displays calls', async ({ page }) => {
    await page.goto('/voice/history');
    await expect(page.locator('[data-testid="voice-history-table"]')).toBeVisible();

    // Vérifier les colonnes
    await expect(page.locator('th')).toContainText(['Date', 'Numéro', 'Durée', 'Statut']);
  });

  test('Voice settings save correctly', async ({ page }) => {
    await page.goto('/voice/settings');

    // Modifier la langue
    await page.selectOption('[data-testid="language-select"]', 'fr-FR');
    await page.click('[data-testid="save-settings-button"]');

    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible();
  });

  test('Call recording download', async ({ page }) => {
    await page.goto('/voice/history');

    // Cliquer sur le premier appel avec enregistrement
    const downloadButton = page.locator('[data-testid="download-recording"]').first();
    if (await downloadButton.isVisible()) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        downloadButton.click(),
      ]);
      expect(download.suggestedFilename()).toContain('.mp3');
    }
  });

  test('Voice agent responds to command', async ({ page }) => {
    await page.goto('/voice/interact');
    await page.fill('[data-testid="voice-command-input"]', 'Quelle est la météo aujourd\'hui ?');
    await page.click('[data-testid="send-command-button"]');

    await expect(page.locator('[data-testid="agent-response"]')).toBeVisible({ timeout: 30000 });
  });
});
