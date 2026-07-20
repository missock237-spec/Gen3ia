// ============================================================
// LOGGER STRUCTURÉ — Basé sur Pino
// ============================================================
// Remplace tous les console.log() par des logs JSON structurés
// Niveaux : debug, info, warn, error, fatal
// ============================================================

import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  serializers: {
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  redact: {
    paths: ["password", "token", "secret", "apiKey", "authorization"],
    censor: "[REDACTED]",
  },
});

export default logger;