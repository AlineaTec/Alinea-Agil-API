import type { PlatformAuditAction } from "../../platform-users/domain/platform-audit-action.js"

export const PLATFORM_AUDIT_SENSITIVITY_TIERS = ["standard", "elevated", "restricted"] as const
export type PlatformAuditSensitivityTier = (typeof PLATFORM_AUDIT_SENSITIVITY_TIERS)[number]

export function platformAuditSensitivityForAction(action: PlatformAuditAction): PlatformAuditSensitivityTier {
  if (
    action === "platform_user.mfa_enrollment_started" ||
    action === "platform_user.mfa_enrolled" ||
    action === "platform_user.mfa_lockout" ||
    action === "platform_user.password_set" ||
    action === "platform_user.invited"
  ) {
    return "elevated"
  }
  if (action === "registration.intents_deleted" || action === "registration.intents_purge_unprovisioned") {
    return "elevated"
  }
  return "standard"
}
