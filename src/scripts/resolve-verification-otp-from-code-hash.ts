/**
 * Solo uso interno / soporte: dado `codeHash` almacenado en `verificationchallenges`,
 * recupera el código OTP numérico probando los candidatos coherentes con
 * `VERIFICATION_CODE_LENGTH` y `REGISTRATION_OTP_PEPPER`.
 *
 * Requiere el mismo `.env` (pepper) que el proceso que creó el desafío; si el pepper cambió desde
 * que se emitió el código, no habrá resultado.
 *
 * Uso desde `api/`:
 *   npm run internal:otp-from-code-hash -- <codeHash_hex>
 *
 * El hash debe ser el mismo string hex de 64 caracteres que aparece en PostgreSQL (`code_hash`).
 */
import "dotenv/config"
import { hashOtpCodeForStorage } from "../modules/registro-onboarding/services/verification-otp.js"
import { VERIFICATION_CODE_LENGTH } from "../modules/registro-onboarding/domain/verification-challenge.policy.js"

const HEX64 = /^[0-9a-f]{64}$/i

function main(): void {
  const raw = process.argv[2]?.trim()
  if (!raw) {
    console.error(
      "Uso: npm run internal:otp-from-code-hash -- <codeHash_hex>\n" +
        "Ejemplo: npm run internal:otp-from-code-hash -- a1b2c3...",
    )
    process.exitCode = 1
    return
  }

  const target = raw.toLowerCase()
  if (!HEX64.test(target)) {
    console.error(
      "codeHash debe ser hex SHA-256 (64 caracteres hex). Valor recibido no válido.",
    )
    process.exitCode = 1
    return
  }

  const pepper = process.env.REGISTRATION_OTP_PEPPER
  if (!pepper || pepper === "dev-otp-pepper-change-me") {
    console.warn(
      "[aviso] REGISTRATION_OTP_PEPPER no definido o valor de desarrollo; si el desafío se creó con otro pepper, el resultado será vacío.",
    )
  }

  const length = VERIFICATION_CODE_LENGTH
  const max = 10 ** length

  for (let i = 0; i < max; i++) {
    const plain = i.toString().padStart(length, "0")
    if (hashOtpCodeForStorage(plain) === target) {
      console.log(plain)
      return
    }
  }

  console.error(
    "No se encontró código que coincida con este hash (pepper distinto, longitud distinta, o hash no es de OTP de registro).",
  )
  process.exitCode = 1
}

main()
