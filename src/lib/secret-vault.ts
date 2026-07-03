import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const KEY_LENGTH = 32
const TAG_LENGTH = 16
const ENCRYPTED_PREFIX = 'enc:v1:'

function getMasterKey(): Buffer {
  const rawKey = process.env.VAULT_MASTER_KEY

  if (!rawKey) {
    throw new Error('VAULT_MASTER_KEY is required')
  }

  if (!/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    throw new Error('VAULT_MASTER_KEY must be a 64-character hex string')
  }

  const key = Buffer.from(rawKey, 'hex')

  if (key.length !== KEY_LENGTH) {
    throw new Error('VAULT_MASTER_KEY must decode to 32 bytes')
  }

  return key
}

export function looksEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX)
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt an empty secret')
  }

  if (looksEncrypted(plaintext)) {
    return plaintext
  }

  const key = getMasterKey()
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])

  const authTag = cipher.getAuthTag()

  return [
    ENCRYPTED_PREFIX,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('')
}

export function decryptSecret(ciphertext: string): string {
  if (!ciphertext) {
    throw new Error('Cannot decrypt an empty secret')
  }

  if (!looksEncrypted(ciphertext)) {
    return ciphertext
  }

  const payload = ciphertext.slice(ENCRYPTED_PREFIX.length)
  const parts = payload.split(':')

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format')
  }

  const [ivB64, tagB64, dataB64] = parts

  const key = getMasterKey()
  const iv = Buffer.from(ivB64, 'base64url')
  const authTag = Buffer.from(tagB64, 'base64url')
  const encrypted = Buffer.from(dataB64, 'base64url')

  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length')
  }

  if (authTag.length !== TAG_LENGTH) {
    throw new Error('Invalid auth tag length')
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return ''
  if (value.length <= 8) return '********'
  return `${value.slice(0, 4)}********${value.slice(-4)}`
}
