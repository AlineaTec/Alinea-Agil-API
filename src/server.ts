import "dotenv/config"

import * as Sentry from "@sentry/node"
import { initApiSentry, isSentryReportingEnvironment } from "./sentry-config.js"
import { useStructuredLogs, writeStructured } from "./logger.js"
import {
  redactEmail,
  redactPostgresUri,
  startupLogBegin,
  startupLogReady,
  startupLogStep,
} from "./startup-log.js"
import { assertDatabaseConfigured } from "./infrastructure/persistence/persistence-driver.js"
import { getPrismaClient } from "./infrastructure/postgres/prisma-client.js"

initApiSentry()

const { createApp } = await import("./app.js")
const { getPort } = await import("./config/env.js")

async function main() {
  const port = getPort()

  startupLogBegin()

  startupLogStep("Entorno", {
    NODE_ENV: process.env.NODE_ENV ?? "(no definido)",
    PORT: port,
  })

  const sentryDsnConfigured = Boolean(process.env.SENTRY_DSN?.trim())
  if (Sentry.isEnabled()) {
    startupLogStep("Observabilidad", {
      sentry: "activo (reportando)",
      sentryEnvironment:
        process.env.SENTRY_ENVIRONMENT?.trim() ||
        process.env.NODE_ENV ||
        "development",
    })
  } else if (sentryDsnConfigured && !isSentryReportingEnvironment()) {
    startupLogStep("Observabilidad", {
      sentry: "DSN configurado; reporte solo en producción",
      APP_ENV: process.env.APP_ENV ?? "(no definido)",
      hint: "Pruebas locales: SENTRY_REPORT_IN_DEV=true",
    })
  } else {
    startupLogStep("Observabilidad", { sentry: "desactivado (sin DSN)" })
  }

  assertDatabaseConfigured()
  startupLogStep("Persistencia", {
    driver: "postgresql",
    orm: "prisma",
    doc: "docs/POSTGRESQL-SETUP.md",
  })

  const pgUrl = process.env.DATABASE_URL?.trim() ?? ""
  startupLogStep("PostgreSQL", {
    action: "connecting",
    uriRedacted: pgUrl ? redactPostgresUri(pgUrl) : "(DATABASE_URL vacía)",
  })
  const prisma = getPrismaClient()
  await prisma.$queryRaw`SELECT 1`
  startupLogStep("PostgreSQL", {
    action: "connected",
    uriRedacted: pgUrl ? redactPostgresUri(pgUrl) : "?",
    driver: "prisma",
  })

  startupLogStep("HTTP (Express)", { action: "mounting" })
  const { app, platformUsersService } = createApp()
  startupLogStep("HTTP (Express)", { action: "ready" })

  const boot = await platformUsersService.bootstrapFromEnvIfNeeded()
  if (boot.status === "created") {
    startupLogStep("Plataforma (bootstrap)", {
      result: "created_super_admin",
      emailRedacted: redactEmail(boot.email),
    })
  } else if (boot.reason === "env_not_configured") {
    startupLogStep("Plataforma (bootstrap)", {
      result: "skipped",
      reason: "env_not_configured",
    })
  } else {
    startupLogStep("Plataforma (bootstrap)", {
      result: "skipped",
      reason: "users_already_exist",
    })
  }

  const listenUrl = `http://127.0.0.1:${port}`
  app.listen(port, () => {
    startupLogReady(listenUrl)
  })
}

main().catch(async (err) => {
  if (useStructuredLogs()) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    writeStructured("error", "startup.failed", {
      error: message,
      ...(stack ? { stack: stack.replace(/\n/g, "\\n") } : {}),
    })
  } else {
    console.error("")
    console.error("  Error al arrancar el API")
    console.error("  ─────────────────────────────")
    console.error(err)
    console.error("")
  }
  if (Sentry.isEnabled()) {
    Sentry.captureException(err)
    await Sentry.flush(2000)
  }
  process.exitCode = 1
})
