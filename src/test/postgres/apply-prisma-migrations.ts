import { execSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

/** Aplica migraciones versionadas contra la URL indicada (p. ej. Testcontainers). */
export function applyPrismaMigrations(databaseUrl: string): void {
  execSync("npx prisma migrate deploy", {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  })
}
