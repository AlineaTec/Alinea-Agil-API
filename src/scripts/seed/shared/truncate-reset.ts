import { getPrismaClient } from "../../../infrastructure/postgres/prisma-client.js"
import { assertSeedAllowed } from "./guard.js"
import { seedLog } from "./log.js"

/**
 * Vacía todas las tablas de `public` excepto `_prisma_migrations`.
 * Usar con `SEED_TRUNCATE_RESET=1` (tests CI / Testcontainers) en lugar de `migrate reset`.
 */
export async function truncateDatabaseData(): Promise<void> {
  assertSeedAllowed()
  const prisma = getPrismaClient()
  try {
    seedLog("Truncando tablas public (CASCADE, conservando _prisma_migrations)...")
    await prisma.$executeRawUnsafe(`
      DO $$ DECLARE r RECORD;
      BEGIN
        FOR r IN (
          SELECT tablename FROM pg_tables
          WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
        ) LOOP
          EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END $$;
    `)
    seedLog("Truncate completado.")
  } finally {
    await prisma.$disconnect()
  }
}
