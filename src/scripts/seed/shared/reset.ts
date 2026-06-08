import { execSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { seedLog } from "./log.js"
import { assertSeedAllowed } from "./guard.js"
import { truncateDatabaseData } from "./truncate-reset.js"

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..")

/**
 * Limpia la BD para re-seed:
 * - Por defecto: `prisma migrate reset --force --skip-seed` (local/dev).
 * - Con `SEED_TRUNCATE_RESET=1`: TRUNCATE CASCADE (tests / Testcontainers; más rápido).
 */
export async function resetDatabase(): Promise<void> {
  assertSeedAllowed()
  if (process.env.SEED_TRUNCATE_RESET === "1") {
    await truncateDatabaseData()
    return
  }
  seedLog("Ejecutando prisma migrate reset (sin seed Prisma integrado)...")
  execSync("npx prisma migrate reset --force --skip-seed", {
    cwd: apiRoot,
    stdio: "inherit",
    env: process.env,
  })
  seedLog("Reset completado (migrate reset).")
}
