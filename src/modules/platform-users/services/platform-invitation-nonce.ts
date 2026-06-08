import { createHash, timingSafeEqual } from "node:crypto"

export function hashInvitationNonce(nonce: string): string {
  return createHash("sha256").update(nonce, "utf8").digest("hex")
}

export function nonceEquals(storedHash: string | null, plain: string): boolean {
  if (!storedHash) return false
  const h = hashInvitationNonce(plain)
  try {
    return timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(h, "hex"))
  } catch {
    return false
  }
}
