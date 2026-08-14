/**
 * API Signature Verifier - HMAC-SHA512 Request Validation
 * 
 * Cryptographically signs all API requests to prevent tampering
 * and unauthorized API access.
 */

import crypto from 'crypto';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-signature-verifier');

export interface SignedRequest {
  body: any;
  signature: string;
  timestamp: number;
  nonce: string;
}

export interface VerificationResult {
  valid: boolean;
  message: string;
  apiKey?: string;
}

class APISignatureVerifier {
  private apiKeys: Map<string, { secret: string; rotatedAt: number }> = new Map();
  private requestCache: Map<string, number> = new Map(); // nonce -> timestamp
  private rotationInterval = 15 * 60 * 1000; // 15 minutes

  constructor() {
    this.initializeAPIKeys();
    this.startRotationTimer();
    log.info('api_signature_verifier_initialized');
  }

  /**
   * Generate new API key pair
   */
  generateAPIKey(): { apiKey: string; secret: string } {
    const apiKey = `gen3ia_${crypto.randomBytes(16).toString('hex')}`;
    const secret = crypto.randomBytes(32).toString('hex');

    this.apiKeys.set(apiKey, {
      secret,
      rotatedAt: Date.now(),
    });

    log.info('api_key_generated', { apiKey: apiKey.slice(0, 16) });

    return { apiKey, secret };
  }

  /**
   * Sign a request
   */
  signRequest(body: any, apiKey: string, secret: string): SignedRequest {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');

    const data = JSON.stringify({ body, timestamp, nonce });
    const signature = crypto
      .createHmac('sha512', secret)
      .update(data)
      .digest('hex');

    return { body, signature, timestamp, nonce };
  }

  /**
   * Verify request signature
   */
  verifySignature(request: SignedRequest, apiKey: string): VerificationResult {
    const keyData = this.apiKeys.get(apiKey);

    if (!keyData) {
      log.warn('api_key_not_found', { apiKey: apiKey.slice(0, 16) });
      return { valid: false, message: 'Invalid API key' };
    }

    // Check timestamp (prevent replay attacks)
    const now = Date.now();
    const timeDiff = Math.abs(now - request.timestamp);
    if (timeDiff > 300000) { // 5 minute window
      log.warn('signature_timestamp_invalid', {
        apiKey: apiKey.slice(0, 16),
        timeDiff,
      });
      return { valid: false, message: 'Request timestamp too old or in future' };
    }

    // Check nonce (prevent replay attacks)
    if (this.requestCache.has(request.nonce)) {
      log.warn('duplicate_nonce_detected', { apiKey: apiKey.slice(0, 16) });
      return { valid: false, message: 'Duplicate nonce - replay attack detected' };
    }

    // Verify signature
    const data = JSON.stringify({
      body: request.body,
      timestamp: request.timestamp,
      nonce: request.nonce,
    });

    const expectedSignature = crypto
      .createHmac('sha512', keyData.secret)
      .update(data)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(request.signature))) {
      log.warn('signature_verification_failed', { apiKey: apiKey.slice(0, 16) });
      return { valid: false, message: 'Signature verification failed' };
    }

    // Cache nonce for replay detection
    this.requestCache.set(request.nonce, now);

    log.info('signature_verified', { apiKey: apiKey.slice(0, 16) });

    return { valid: true, message: 'Signature verified', apiKey };
  }

  /**
   * Rotate API key (generate new secret)
   */
  rotateAPIKey(apiKey: string): { oldSecret: string; newSecret: string } | null {
    const keyData = this.apiKeys.get(apiKey);

    if (!keyData) {
      return null;
    }

    const oldSecret = keyData.secret;
    const newSecret = crypto.randomBytes(32).toString('hex');

    this.apiKeys.set(apiKey, {
      secret: newSecret,
      rotatedAt: Date.now(),
    });

    log.info('api_key_rotated', { apiKey: apiKey.slice(0, 16) });

    return { oldSecret, newSecret };
  }

  /**
   * Initialize API keys from environment
   */
  private initializeAPIKeys() {
    const apiKeysEnv = process.env.GEN3IA_API_KEYS;
    if (apiKeysEnv) {
      try {
        const parsed = JSON.parse(apiKeysEnv);
        Object.entries(parsed).forEach(([key, secret]: any) => {
          this.apiKeys.set(key, { secret, rotatedAt: Date.now() });
        });
        log.info('api_keys_loaded', { count: this.apiKeys.size });
      } catch (error) {
        log.error('failed_to_parse_api_keys', { error });
      }
    }
  }

  /**
   * Start automatic key rotation timer
   */
  private startRotationTimer() {
    setInterval(() => {
      // Automatically rotate keys that haven't been rotated recently
      this.apiKeys.forEach((keyData, apiKey) => {
        const rotatedMinutesAgo = (Date.now() - keyData.rotatedAt) / 60000;
        if (rotatedMinutesAgo > 24 * 60) { // 24 hours
          this.rotateAPIKey(apiKey);
        }
      });
    }, 60 * 60 * 1000); // Check every hour
  }
}

export const apiSignatureVerifier = new APISignatureVerifier();
