import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

export function hashPlatformPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(password, salt, 64).toString("hex")
  return { salt, hash }
}

export function verifyPlatformPassword(password: string, salt: string, hash: string): boolean {
  try {
    const derived = scryptSync(password, salt, 64)
    const expected = Buffer.from(hash, "hex")
    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}
