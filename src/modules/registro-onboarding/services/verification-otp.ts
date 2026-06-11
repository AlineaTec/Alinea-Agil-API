import { createHash, randomInt } from "node:crypto"
import { VERIFICATION_CODE_LENGTH } from "../domain/verification-challenge.policy.js"

/**
 * OTP numérico de longitud fija (p. ej. 6 dígitos), sin cerebro en el cliente.
 */
export function generateNumericOtp(
  length: number = VERIFICATION_CODE_LENGTH,
): string {
  const max = 10 ** length
  return randomInt(0, max).toString().padStart(length, "0")
}

/** Normaliza entrada del usuario o generación antes de hashear. */
export function normalizeOtpPlainCode(
  plainCode: string,
  length: number = VERIFICATION_CODE_LENGTH,
): string {
  const digits = plainCode.replace(/\D/g, "")
  if (digits.length >= length) {
    return digits.slice(-length)
  }
  return digits.padStart(length, "0")
}

/**
 * Huella del código para persistencia. **Pepper** obligatorio en producción vía env.
 * TODO [P]: rotación de pepper y algoritmo acordado con seguridad.
 */
export function hashOtpCodeForStorage(plainCode: string): string {
  const normalized = normalizeOtpPlainCode(plainCode)
  const pepper =
    process.env.REGISTRATION_OTP_PEPPER ?? "dev-otp-pepper-change-me"
  return createHash("sha256")
    .update(`${pepper}:${normalized}`, "utf8")
    .digest("hex")
}
