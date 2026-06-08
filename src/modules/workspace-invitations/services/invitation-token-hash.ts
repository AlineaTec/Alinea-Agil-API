import { createHash } from "node:crypto"

export function hashWorkspaceInvitationOpaqueToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex")
}
