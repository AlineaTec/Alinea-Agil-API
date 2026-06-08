import { createHash, randomBytes } from "node:crypto"

/** Token opaco para el cliente; nunca persistir en claro. */
export function generateOpaqueSessionToken(): string {
  return randomBytes(32).toString("base64url")
}

/** Hash unidireccional para almacenar en `AuthSession.tokenHash`. */
export function hashSessionTokenForStorage(opaqueToken: string): string {
  return createHash("sha256").update(opaqueToken, "utf8").digest("hex")
}
