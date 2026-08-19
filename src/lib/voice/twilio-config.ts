// ============================================================
// Twilio Config — Gère la configuration téléphonique des
// utilisateurs pour les appels vocaux via leurs numéros
// ============================================================

import { db } from '@/lib/db';
import { encryptSecret, decryptSecret } from '@/lib/secret-vault';

export interface TwilioUserConfig {
  userId: string;
  accountSid: string;
  authToken: string;
  twilioPhoneNumber: string;
  twilioPhoneNumberSid: string;
  isConfigured: boolean;
}

interface TwilioPhoneNumberPayload {
  phone_number?: string;
  sid?: string;
  capabilities?: Record<string, boolean>;
}

export class TwilioConfigManager {
  /**
   * Sauvegarde la configuration Twilio d'un utilisateur
   */
  async saveUserConfig(
    userId: string,
    config: {
      accountSid: string;
      authToken: string;
      twilioPhoneNumber: string;
      twilioPhoneNumberSid: string;
    }
  ): Promise<void> {
    await db.userResource.upsert({
      where: { userId_type: { userId, type: 'twilio' } },
      create: {
        userId,
        type: 'twilio',
        name: 'Twilio Voice Config',
        apiKey: encryptSecret(config.accountSid),
        config: encryptSecret(config.authToken),
        endpoint: config.twilioPhoneNumber,
        isActive: true,
      },
      update: {
        apiKey: encryptSecret(config.accountSid),
        config: encryptSecret(config.authToken),
        endpoint: config.twilioPhoneNumber,
        isActive: true,
      },
    });
  }

  /**
   * Récupère la configuration Twilio d'un utilisateur
   */
  async getUserConfig(userId: string): Promise<TwilioUserConfig | null> {
    const resource = await db.userResource.findUnique({
      where: { userId_type: { userId, type: 'twilio' } },
    });

    if (!resource || !resource.apiKey || !resource.endpoint) {
      return null;
    }

    return {
      userId,
      accountSid: decryptSecret(resource.apiKey),
      authToken: decryptSecret(resource.config || ''),
      twilioPhoneNumber: resource.endpoint,
      twilioPhoneNumberSid: resource.name,
      isConfigured: true,
    };
  }

  /**
   * Vérifie si un utilisateur a configuré Twilio
   */
  async isConfigured(userId: string): Promise<boolean> {
    const config = await this.getUserConfig(userId);
    return config !== null && config.isConfigured;
  }

  /**
   * Supprime la configuration Twilio d'un utilisateur
   */
  async deleteUserConfig(userId: string): Promise<void> {
    await db.userResource.deleteMany({
      where: { userId, type: 'twilio' },
    });
  }

  /**
   * Récupère tous les numéros de téléphone Twilio disponibles
   * pour un utilisateur (via API Twilio)
   */
  async getUserPhoneNumbers(userId: string): Promise<Array<{
    phoneNumber: string;
    phoneNumberSid: string;
    capabilities: Record<string, boolean>;
  }>> {
    const config = await this.getUserConfig(userId);
    if (!config) return [];

    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/IncomingPhoneNumbers.json`,
        {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
          },
        }
      );

      if (!response.ok) return [];

      const data = (await response.json()) as { incoming_phone_numbers?: TwilioPhoneNumberPayload[] };
      return (data.incoming_phone_numbers || []).map((num: TwilioPhoneNumberPayload) => ({
        phoneNumber: num.phone_number || '',
        phoneNumberSid: num.sid || '',
        capabilities: num.capabilities || {},
      }));
    } catch {
      return [];
    }
  }
}

export const twilioConfigManager = new TwilioConfigManager();
