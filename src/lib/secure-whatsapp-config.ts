/**
 * Configuration WhatsApp sécurisée — Intégration retirée du projet Gen3ia.
 * Module neutralisé : aucun accès base de données (modèle WhatsAppConfig supprimé).
 * L'API publique est conservée pour ne pas casser les importateurs existants.
 */

interface UpsertWhatsAppConfigInput {
  userId: string;
  phoneNumber: string;
  whatsappId?: string;
  phoneNumberId?: string;
  apiToken?: string;
  isActive?: boolean;
  autoMessage?: boolean;
  autoCall?: boolean;
}

export async function upsertSecureWhatsAppConfig(
  _input: UpsertWhatsAppConfigInput
): Promise<{
  id: string;
  userId: string;
  phoneNumber: string;
  whatsappId: string | null;
  phoneNumberId: string | null;
  apiToken: string | null;
  isActive: boolean;
  autoMessage: boolean;
  autoCall: boolean;
  createdAt: Date;
  updatedAt: Date;
} | null> {
  // Intégration retirée
  return null;
}

export async function getDecryptedWhatsAppConfig(
  _userId: string
): Promise<{
  id: string;
  userId: string;
  phoneNumber: string;
  whatsappId: string | null;
  phoneNumberId: string | null;
  apiToken: string | null;
  isActive: boolean;
  autoMessage: boolean;
  autoCall: boolean;
  createdAt: Date;
  updatedAt: Date;
} | null> {
  // Intégration retirée
  return null;
}
