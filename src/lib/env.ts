function requiredEnv(name: string): string {
  const value = process.env[name]

  if (!value || value.trim() === '') {
    throw new Error(`${name} is required`)
  }

  return value
}

export const env = {
  DATABASE_URL: requiredEnv('DATABASE_URL'),
  VAULT_MASTER_KEY: requiredEnv('VAULT_MASTER_KEY'),
}
