/**
 * Extrae el token de `Authorization: Bearer <token>` (RFC 6750 subset).
 * Retorna `null` si falta header o no es Bearer.
 */
export function parseBearerToken(
  authorization: string | undefined,
): string | null {
  if (authorization === undefined || typeof authorization !== "string") {
    return null
  }
  const m = /^Bearer\s+(\S+)/i.exec(authorization.trim())
  if (!m?.[1]) return null
  return m[1]
}
