import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as typeof globalThis & {
  __alineaPrisma?: PrismaClient
}

export type PrismaClientOptions = {
  /** Sobrescribe DATABASE_URL (p. ej. Testcontainers en integración). */
  databaseUrl?: string
}

/**
 * Cliente Prisma reutilizable (un singleton por proceso, como singleton de cliente ORM).
 * Los repositorios por dominio deben recibir PrismaClient por constructor o módulo.
 */
export function getPrismaClient(options?: PrismaClientOptions): PrismaClient {
  if (options?.databaseUrl) {
    return new PrismaClient({
      datasources: { db: { url: options.databaseUrl } },
    })
  }

  if (!globalForPrisma.__alineaPrisma) {
    globalForPrisma.__alineaPrisma = new PrismaClient()
  }
  return globalForPrisma.__alineaPrisma
}

/** Cierra el singleton del proceso (scripts, tests, shutdown). */
export async function disconnectPrismaClient(): Promise<void> {
  const client = globalForPrisma.__alineaPrisma
  if (!client) return
  await client.$disconnect()
  globalForPrisma.__alineaPrisma = undefined
}
