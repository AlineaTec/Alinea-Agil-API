import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

const FORMAT_PREFIX = "v1.scrypt"
const SALT_BYTES = 16
const KEY_BYTES = 64

/**
 * Hash de contraseña **solo para persistencia en `IdentityRegistrationIntent`** (Fase E).
 *
 * - Algoritmo: scrypt (sync) con sal aleatoria por escritura.
 * - **Pepper** de aplicación vía `REGISTRATION_INTENT_PASSWORD_PEPPER` (obligatorio revisar en producción).
 *
 * **Provisional:** este formato prepara el intento antes de la activación; al crear el usuario
 * definitivo el equipo de identidad puede re-hashear (p. ej. bcrypt / Argon2 / proveedor IdP)
 * y **no** debe asumir que el login valida contra este campo.
 *
 * Formato almacenado: `v1.scrypt$<saltB64url>$<hashB64url>`
 */
export function hashIdentityRegistrationIntentPassword(plainPassword: string): string {
  const pepper = registrationIntentPepper()
  const salt = randomBytes(SALT_BYTES)
  const derived = scryptSync(plainPassword + "\x00" + pepper, salt, KEY_BYTES, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  })
  return `${FORMAT_PREFIX}$${salt.toString("base64url")}$${derived.toString("base64url")}`
}

function registrationIntentPepper(): string {
  return (
    process.env.REGISTRATION_INTENT_PASSWORD_PEPPER ??
    "dev-intent-password-pepper-change-me"
  )
}

/**
 * Verifica contraseña contra un hash en formato `v1.scrypt$...` (mismo que Fase E e intento copiado en `IdentityRegisteredUser`).
 * Usado por **login-session**; el formato sigue siendo evolutivo **[P]**.
 */
export function verifyIdentityRegistrationIntentPassword(
  plainPassword: string,
  stored: string,
): boolean {
  const parts = stored.split("$")
  if (parts.length !== 3 || parts[0] !== FORMAT_PREFIX) {
    return false
  }
  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(parts[1], "base64url")
    expected = Buffer.from(parts[2], "base64url")
  } catch {
    return false
  }
  if (salt.length === 0 || expected.length !== KEY_BYTES) {
    return false
  }
  const pepper = registrationIntentPepper()
  const derived = scryptSync(plainPassword + "\x00" + pepper, salt, KEY_BYTES, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  })
  return derived.length === expected.length && timingSafeEqual(derived, expected)
}
