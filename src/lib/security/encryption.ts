/**
 * Chiffrement de bout en bout — Chiffrement côté client des données sensibles.
 * Utilise Web Crypto API (AES-256-GCM) via Node.js.
 * Les clés sont dérivées du mot de passe de l'utilisateur (PBKDF2).
 */

import { webcrypto } from "node:crypto"

const subtle = webcrypto.subtle

const SALT_LENGTH = 16
const IV_LENGTH = 12
const KEY_ITERATIONS = 100_000
const KEY_LENGTH = 256

/**
 * Dérive une clé AES-256-GCM depuis un mot de passe via PBKDF2.
 * (Le type de clé est celui de la WebCrypto de Node.)
 */
export async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>) {
  const keyMaterial = await subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  )
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: KEY_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  )
}

/**
 * Chiffre une chaîne avec AES-256-GCM.
 * @returns Base64(salt + iv + ciphertext)
 */
export async function encryptString(plaintext: string, password: string): Promise<string> {
  const salt = webcrypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const key = await deriveKey(password, salt)
  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  )
  const combined = Buffer.concat([Buffer.from(salt), Buffer.from(iv), Buffer.from(new Uint8Array(ciphertext))])
  return combined.toString("base64")
}

/**
 * Déchiffre une chaîne AES-256-GCM.
 */
export async function decryptString(encrypted: string, password: string): Promise<string> {
  const combined = Buffer.from(encrypted, "base64")
  const salt = new Uint8Array(combined.subarray(0, SALT_LENGTH))
  const iv = new Uint8Array(combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH))
  const ciphertext = new Uint8Array(combined.subarray(SALT_LENGTH + IV_LENGTH))
  const key = await deriveKey(password, salt)
  const plaintext = await subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  )
  return new TextDecoder().decode(plaintext)
}

/**
 * Génère une clé aléatoire (pour les clés de session).
 */
export function generateKey(): string {
  return Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString("base64")
}

/**
 * Chiffre un objet JSON.
 */
export async function encryptJSON(data: unknown, password: string): Promise<string> {
  return encryptString(JSON.stringify(data), password)
}

/**
 * Déchiffre un objet JSON.
 */
export async function decryptJSON(encrypted: string, password: string): Promise<unknown> {
  const json = await decryptString(encrypted, password)
  return JSON.parse(json)
}
