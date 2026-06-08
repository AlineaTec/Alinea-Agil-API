import { verifyIdentityRegistrationIntentPassword } from "../../registro-onboarding/services/intent-password-hash.js"

/**
 * Valida contraseña contra el hash del `IdentityRegisteredUser` (formato `v1.scrypt$…` provisional).
 */
export function verifyIdentityRegisteredUserPassword(
  plainPassword: string,
  storedHash: string,
): boolean {
  return verifyIdentityRegistrationIntentPassword(plainPassword, storedHash)
}
