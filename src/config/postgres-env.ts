/**
 * Variables de entorno para PostgreSQL (Prisma).
 * No se cargan en el arranque HTTP vía Prisma en el arranque HTTP.
 */

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) {
    throw new Error("DATABASE_URL is required for PostgreSQL / Prisma operations")
  }
  return url
}

/** URL opcional; útil para scripts que degradan con mensaje claro. */
export function getDatabaseUrlOrNull(): string | null {
  const url = process.env.DATABASE_URL?.trim()
  return url || null
}
