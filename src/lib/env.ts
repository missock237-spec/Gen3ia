function requiredEnv(name: string): string {
  const value = process.env[name]

  if (!value || value.trim() === '') {
    throw new Error(`${name} is required`)
  }

  return value
}

// Getters ensure env vars are only read at access time, not at module import.
// This prevents crashes during build or on routes that don't use the database.
export const env = {
  get DATABASE_URL(): string {
    return requiredEnv('DATABASE_URL')
  },
}
