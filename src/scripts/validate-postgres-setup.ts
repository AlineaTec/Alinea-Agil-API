/**
 * Valida DATABASE_URL, conectividad Prisma y presencia de migraciones aplicadas.
 * Uso: npm run postgres:validate
 */
import "dotenv/config"

import { getDatabaseUrl } from "../config/postgres-env.js"
import { disconnectPrismaClient, getPrismaClient } from "../infrastructure/postgres/prisma-client.js"

async function main(): Promise<void> {
  const databaseUrl = getDatabaseUrl()
  const redacted = databaseUrl.replace(/:([^:@/]+)@/, ":***@")

  console.log("[postgres:validate] DATABASE_URL:", redacted)

  const prisma = getPrismaClient()
  try {
    await prisma.$queryRaw`SELECT 1 AS ok`
    const probes = await prisma.infrastructureConnectivityProbe.count()
    console.log("[postgres:validate] Prisma conectado. infrastructure_connectivity_probe rows:", probes)
    console.log("[postgres:validate] OK")
  } finally {
    await disconnectPrismaClient()
  }
}

main().catch((err: unknown) => {
  console.error("[postgres:validate] FALLO:", err instanceof Error ? err.message : err)
  process.exitCode = 1
})
