import { describe, it, expect, beforeEach } from 'vitest';
import { licenseManager } from '@/lib/security/license-manager';
import { apiSignatureVerifier } from '@/lib/security/api-signature-verifier';

describe('Security Systems - Production Tests', () => {
  describe('License Manager', () => {
    it('should generate valid license keys', () => {
      const license = licenseManager.generateLicense('test-org', 1, 365);

      expect(license).toBeDefined();
      expect(license.key).toHaveLength(32);
      expect(license.organization).toBe('test-org');
      expect(license.expiresAt).toBeInstanceOf(Date);
    });

    it('should validate active licenses', () => {
      const license = licenseManager.generateLicense('test-org-2', 1, 365);
      const validation = licenseManager.validateLicense(license.key, '');

      expect(validation.valid).toBe(true);
      expect(validation.organization).toBe('test-org-2');
    });

    it('should reject expired licenses', () => {
      const license = licenseManager.generateLicense('test-org-3', 1, -1); // Expired
      const validation = licenseManager.validateLicense(license.key, '');

      expect(validation.valid).toBe(false);
      expect(validation.message).toContain('expired');
    });

    it('should bind licenses to hardware', () => {
      const license = licenseManager.generateLicense('test-org-4', 1, 365);
      const hardwareId = 'hardware-123';

      const bound = licenseManager.bindLicense(license.key, hardwareId);
      expect(bound).toBe(true);

      const validation = licenseManager.validateLicense(license.key, hardwareId);
      expect(validation.valid).toBe(true);
    });

    it('should reject mismatched hardware', () => {
      const license = licenseManager.generateLicense('test-org-5', 1, 365);
      licenseManager.bindLicense(license.key, 'hardware-original');

      const validation = licenseManager.validateLicense(license.key, 'hardware-different');
      expect(validation.valid).toBe(false);
    });
  });

  describe('API Signature Verifier', () => {
    it('should generate valid API keys', () => {
      const { apiKey, secret } = apiSignatureVerifier.generateAPIKey();

      expect(apiKey).toBeDefined();
      expect(apiKey).toMatch(/^gen3ia_/);
      expect(secret).toHaveLength(64);
    });

    it('should sign requests with HMAC-SHA512', () => {
      const { apiKey, secret } = apiSignatureVerifier.generateAPIKey();
      const body = { test: 'data' };

      const signed = apiSignatureVerifier.signRequest(body, apiKey, secret);

      expect(signed.signature).toBeDefined();
      expect(signed.timestamp).toBeGreaterThan(0);
      expect(signed.nonce).toHaveLength(32);
    });

    it('should verify valid signatures', () => {
      const { apiKey, secret } = apiSignatureVerifier.generateAPIKey();
      const body = { test: 'data' };

      const signed = apiSignatureVerifier.signRequest(body, apiKey, secret);
      const verification = apiSignatureVerifier.verifySignature(signed, apiKey);

      expect(verification.valid).toBe(true);
      expect(verification.apiKey).toBe(apiKey);
    });

    it('should reject invalid signatures', () => {
      const { apiKey, secret } = apiSignatureVerifier.generateAPIKey();
      const body = { test: 'data' };

      const signed = apiSignatureVerifier.signRequest(body, apiKey, secret);
      signed.signature = 'invalid-signature-12345678901234567890';

      const verification = apiSignatureVerifier.verifySignature(signed, apiKey);

      expect(verification.valid).toBe(false);
    });

    it('should reject old timestamps', () => {
      const { apiKey, secret } = apiSignatureVerifier.generateAPIKey();
      const body = { test: 'data' };

      const signed = apiSignatureVerifier.signRequest(body, apiKey, secret);
      signed.timestamp = Date.now() - 600000; // 10 minutes ago

      const verification = apiSignatureVerifier.verifySignature(signed, apiKey);

      expect(verification.valid).toBe(false);
    });

    it('should rotate API keys', () => {
      const { apiKey, secret } = apiSignatureVerifier.generateAPIKey();

      const rotation = apiSignatureVerifier.rotateAPIKey(apiKey);

      expect(rotation).toBeDefined();
      expect(rotation!.oldSecret).toBe(secret);
      expect(rotation!.newSecret).not.toBe(secret);
    });

    it('should detect replay attacks via nonce', () => {
      const { apiKey, secret } = apiSignatureVerifier.generateAPIKey();
      const body = { test: 'data' };

      const signed = apiSignatureVerifier.signRequest(body, apiKey, secret);
      const firstVerification = apiSignatureVerifier.verifySignature(signed, apiKey);

      expect(firstVerification.valid).toBe(true);

      // Try to replay the same request
      const secondVerification = apiSignatureVerifier.verifySignature(signed, apiKey);

      expect(secondVerification.valid).toBe(false);
    });
  });

  describe('Security Integration', () => {
    it('should enforce licensing before processing', () => {
      const license = licenseManager.generateLicense('secure-test-org', 1, 365);
      const validation = licenseManager.validateLicense(license.key, '');

      expect(validation.valid).toBe(true);
      expect(validation.message).toBe('License is valid');
    });

    it('should require valid API key for all requests', () => {
      const { _apiKey } = apiSignatureVerifier.generateAPIKey();
      const invalidVerification = apiSignatureVerifier.verifySignature(
        {
          body: {},
          signature: 'invalid',
          timestamp: Date.now(),
          nonce: 'test',
        },
        'invalid-key'
      );

      expect(invalidVerification.valid).toBe(false);
    });
  });
});
