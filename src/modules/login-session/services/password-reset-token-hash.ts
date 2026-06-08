import { createHash } from "node:crypto"

/** Hash SHA-256 hex del token opaco enviado por correo (no persistir el token en claro). */
export function hashPasswordResetOpaqueToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex")
}
