/**
 * Evita ejecutar seeds contra bases no destinadas a desarrollo local.
 * Requiere `ALLOW_DB_SEED=1` explícito.
 */
export function assertSeedAllowed(): void {
  if (process.env.ALLOW_DB_SEED !== "1") {
    console.error(
      "[seed] Abortado: define ALLOW_DB_SEED=1 para confirmar que quieres modificar la base.",
    )
    console.error("[seed] Uso típico local: ALLOW_DB_SEED=1 npm run db:reset:demo")
    process.exitCode = 1
    throw new Error("seed_not_allowed")
  }
  const url = process.env.DATABASE_URL?.trim() ?? ""
  if (!url) {
    console.error("[seed] DATABASE_URL no está definida.")
    process.exitCode = 1
    throw new Error("database_url_missing")
  }
}
