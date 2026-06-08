import { PostgreSqlContainer } from "@testcontainers/postgresql"
import type { PrismaClient } from "@prisma/client"
import { applyPrismaMigrations } from "./apply-prisma-migrations.js"
import { getPrismaClient } from "../../infrastructure/postgres/prisma-client.js"

export const POSTGRES_TEST_TIMEOUT_MS = 180_000
export const POSTGRES_CONTAINER_TIMEOUT_MS = 120_000

type StartedPostgresContainer = {
  getConnectionUri(): string
  stop(): Promise<unknown>
}

export type PostgresTestContext = {
  databaseUrl: string
  prisma: PrismaClient
  stop: () => Promise<void>
}

/**
 * URL para tests de integración:
 * 1. `DATABASE_URL_TEST` si está definida (Postgres local/CI persistente)
 * 2. Testcontainers si no hay URL de entorno
 */
function resolveTestDatabaseUrl(): string | null {
  const testUrl = process.env.DATABASE_URL_TEST?.trim()
  if (testUrl) return testUrl
  if (process.env.POSTGRES_TEST_USE_ENV === "1") {
    const envUrl = process.env.DATABASE_URL?.trim()
    if (envUrl) return envUrl
  }
  return null
}

/** Postgres listo con migraciones aplicadas y cliente Prisma. */
export async function startPostgresTestEnvironment(): Promise<PostgresTestContext> {
  const envUrl = resolveTestDatabaseUrl()

  if (envUrl) {
    applyPrismaMigrations(envUrl)
    const prisma = getPrismaClient({ databaseUrl: envUrl })
    return {
      databaseUrl: envUrl,
      prisma,
      stop: async () => {
        await prisma.$disconnect()
      },
    }
  }

  const container = (await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("alinea_agil_test")
    .withUsername("alinea")
    .withPassword("alinea_test")
    .start()) as StartedPostgresContainer

  const databaseUrl = container.getConnectionUri()
  applyPrismaMigrations(databaseUrl)
  const prisma = getPrismaClient({ databaseUrl })

  return {
    databaseUrl,
    prisma,
    stop: async () => {
      await prisma.$disconnect()
      await container.stop()
    },
  }
}
