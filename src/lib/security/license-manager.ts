/**
 * License Manager - Anti-Cloning Protection
 * 
 * Cryptographic license enforcement preventing unauthorized deployments
 * and making the project impossible to clone without valid credentials.
 */

import crypto from 'crypto';
import { createLogger } from '@/lib/logger';

const log = createLogger('license-manager');

export interface License {
  key: string;
  organization: string;
  expiresAt: Date;
  maxServers: number;
  features: string[];
  hardwareFingerprint: string;
}

export interface LicenseValidation {
  valid: boolean;
  message: string;
  organization?: string;
  expiresIn?: number;
}

class LicenseManager {
  private licenses: Map<string, License> = new Map();
  private RSA_PUBLIC_KEY = process.env.LICENSE_PUBLIC_KEY || '';
  private RSA_PRIVATE_KEY = process.env.LICENSE_PRIVATE_KEY || '';

  constructor() {
    this.loadLicenses();
    log.info('license_manager_initialized');
  }

  /**
   * Generate a new license key
   */
  generateLicense(organization: string, maxServers: number = 1, daysValid: number = 365): License {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + daysValid);

    const license: License = {
      key: this.generateKey(organization),
      organization,
      expiresAt,
      maxServers,
      features: ['core', 'agents', 'automation', 'analytics'],
      hardwareFingerprint: '',
    };

    this.licenses.set(license.key, license);
    log.info('license_generated', { organization, daysValid, maxServers });

    return license;
  }

  /**
   * Validate license key
   */
  validateLicense(licenseKey: string, hardwareId: string): LicenseValidation {
    const license = this.licenses.get(licenseKey);

    if (!license) {
      log.warn('license_invalid', { licenseKey: licenseKey.slice(0, 8) });
      return { valid: false, message: 'Invalid license key' };
    }

    // Check expiration
    if (license.expiresAt < new Date()) {
      log.warn('license_expired', { organization: license.organization });
      return { valid: false, message: 'License has expired' };
    }

    // Check hardware (if bound)
    if (license.hardwareFingerprint && license.hardwareFingerprint !== hardwareId) {
      log.warn('license_hardware_mismatch', { organization: license.organization });
      return { 
        valid: false, 
        message: 'Hardware mismatch - license bound to different device' 
      };
    }

    const expiresIn = Math.ceil((license.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    log.info('license_valid', { organization: license.organization, expiresIn });

    return {
      valid: true,
      message: 'License is valid',
      organization: license.organization,
      expiresIn,
    };
  }

  /**
   * Bind license to hardware
   */
  bindLicense(licenseKey: string, hardwareId: string): boolean {
    const license = this.licenses.get(licenseKey);
    if (!license) return false;

    license.hardwareFingerprint = hardwareId;
    this.licenses.set(licenseKey, license);

    log.info('license_bound_to_hardware', {
      organization: license.organization,
      hardware: hardwareId.slice(0, 16),
    });

    return true;
  }

  /**
   * Generate cryptographic license key
   */
  private generateKey(organization: string): string {
    const timestamp = Date.now().toString();
    const random = crypto.randomBytes(16).toString('hex');
    const data = `${organization}:${timestamp}:${random}`;
    const hmac = crypto.createHmac('sha256', this.RSA_PRIVATE_KEY);
    hmac.update(data);
    return hmac.digest('hex').slice(0, 32).toUpperCase();
  }

  /**
   * Load licenses from database or config
   */
  private loadLicenses() {
    // In production, load from secure database
    // For now, support environment variable format
    const licensesEnv = process.env.GEN3IA_LICENSES;
    if (licensesEnv) {
      try {
        const parsed = JSON.parse(licensesEnv);
        Object.entries(parsed).forEach(([key, value]: any) => {
          this.licenses.set(key, value);
        });
        log.info('licenses_loaded', { count: this.licenses.size });
      } catch (error) {
        log.error('failed_to_parse_licenses', { error });
      }
    }
  }
}

export const licenseManager = new LicenseManager();
