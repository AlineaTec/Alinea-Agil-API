/**
 * Idempotente: crea o actualiza el usuario de plataforma indicado por env como `platform_super_admin` activo.
 * Uso: definir `PLATFORM_BOOTSTRAP_SUPER_ADMIN_EMAIL` y `PLATFORM_BOOTSTRAP_SUPER_ADMIN_PASSWORD` (≥10 caracteres)
 * y ejecutar `npm run seed:platform`.
 *
 * Requiere PostgreSQL (`DATABASE_URL`). No sustituye políticas de producción.
 */
import "dotenv/config"
import { randomUUID } from "node:crypto"
import { assertDatabaseConfigured } from "../infrastructure/persistence/persistence-driver.js"
import { getPrismaClient } from "../infrastructure/postgres/prisma-client.js"
import { normalizeEmailBasic } from "../modules/registro-onboarding/validation/email-normalization.js"
import { hashPlatformPassword } from "../modules/platform-users/services/platform-password.js"

async function main() {
  assertDatabaseConfigured()
  const emailRaw = process.env.PLATFORM_BOOTSTRAP_SUPER_ADMIN_EMAIL?.trim()
  const password = process.env.PLATFORM_BOOTSTRAP_SUPER_ADMIN_PASSWORD
  if (!emailRaw || !password || password.length < 10) {
    console.error(
      "Definir PLATFORM_BOOTSTRAP_SUPER_ADMIN_EMAIL y PLATFORM_BOOTSTRAP_SUPER_ADMIN_PASSWORD (mín. 10 caracteres).",
    )
    process.exitCode = 1
    return
  }

  const email = normalizeEmailBasic(emailRaw)
  const { salt, hash } = hashPlatformPassword(password)
  const now = new Date()
  const platformUserId = randomUUID()
  const prisma = getPrismaClient()

  const row = await prisma.platformUser.upsert({
    where: { email },
    create: {
      platform_user_id: platformUserId,
      email,
      display_name: "Super admin (seed)",
      role: "platform_super_admin",
      status: "active",
      mfa_status: "not_enrolled",
      mfa_totp_secret_base32: null,
      mfa_failed_attempts: 0,
      mfa_locked_until: null,
      invitation_nonce_hash: null,
      password_salt: salt,
      password_hash: hash,
      created_at: now,
      updated_at: now,
    },
    update: {
      password_salt: salt,
      password_hash: hash,
      role: "platform_super_admin",
      status: "active",
      mfa_status: "not_enrolled",
      mfa_totp_secret_base32: null,
      mfa_failed_attempts: 0,
      mfa_locked_until: null,
      invitation_nonce_hash: null,
      display_name: "Super admin (seed)",
      updated_at: now,
    },
  })

  console.error(
    `[seed:platform] Listo: ${row.email} (${row.platform_user_id}) — rol ${row.role}, estado ${row.status}.`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
