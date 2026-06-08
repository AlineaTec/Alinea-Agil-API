import type { Express } from "express"
import * as Sentry from "@sentry/node"

/**
 * Sentry solo se inicializa en ambiente productivo (salvo `SENTRY_REPORT_IN_DEV=true` para pruebas).
 * Precedencia: `APP_ENV` → `SENTRY_ENVIRONMENT` → `NODE_ENV` (cada uno debe ser `production`).
 */
export function isSentryReportingEnvironment(): boolean {
  const force =
    process.env.SENTRY_REPORT_IN_DEV?.trim().toLowerCase() === "true" ||
    process.env.SENTRY_REPORT_IN_DEV === "1"
  if (force) return true

  const app = process.env.APP_ENV?.trim().toLowerCase()
  if (app) return app === "production"
  const se = process.env.SENTRY_ENVIRONMENT?.trim().toLowerCase()
  if (se) return se === "production"
  return process.env.NODE_ENV?.trim().toLowerCase() === "production"
}

export function initApiSentry(): void {
  const dsn = process.env.SENTRY_DSN?.trim()
  if (!dsn || !isSentryReportingEnvironment()) return

  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT?.trim() ||
      process.env.NODE_ENV ||
      "development",
    tracesSampleRate:
      Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0") || 0,
    integrations: [Sentry.expressIntegration()],
    /** Identifica el origen si varios clientes comparten proyecto u organización en Sentry. */
    initialScope: {
      tags: {
        alinea_service: "api",
        runtime: "node",
      },
    },
  })
}

export function setupExpressSentry(app: Express): void {
  if (!Sentry.isEnabled()) return
  Sentry.setupExpressErrorHandler(app)
}
