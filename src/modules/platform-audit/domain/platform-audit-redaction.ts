import type { PlatformRole } from "../../platform-users/domain/platform-role.js"
import { shallowChangedFieldNames } from "./platform-audit-changed-fields.js"
import type { PlatformAuditSensitivityTier } from "./platform-audit-sensitivity.js"

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g

function redactEmails(text: string): string {
  return text.replace(EMAIL_RE, "[email_redacted]")
}

function redactUuid(id: string): string {
  if (id.length <= 12) return "***"
  return `${id.slice(0, 4)}…${id.slice(-4)}`
}

function truncateJson(value: unknown, maxChars: number): unknown {
  if (value === null || value === undefined) return value
  const s = JSON.stringify(value)
  if (s.length <= maxChars) return JSON.parse(s) as unknown
  return { _truncated: true, preview: s.slice(0, maxChars) + "…" }
}

export type RedactionLevel = "full" | "intermediate" | "auditor"

export function redactionLevelForRole(role: PlatformRole): RedactionLevel {
  if (role === "platform_super_admin") return "full"
  if (role === "platform_operator") return "intermediate"
  return "auditor"
}

export function redactSummary(summary: string, level: RedactionLevel): string {
  if (level === "auditor") return redactEmails(summary)
  if (level === "intermediate") return redactEmails(summary)
  return summary
}

export function redactPlatformUserId(id: string | null, level: RedactionLevel): string | null {
  if (id === null) return null
  if (level === "auditor") return redactUuid(id)
  return id
}

export function redactTenantOrWorkspaceId(id: string | null, level: RedactionLevel): string | null {
  if (id === null) return null
  if (level === "auditor") return redactUuid(id)
  return id
}

export function redactPayloadPair(
  before: unknown,
  after: unknown,
  level: RedactionLevel,
  tier: PlatformAuditSensitivityTier,
): { before: unknown | null; after: unknown | null; changedFields: string[] | null } {
  const changed = shallowChangedFieldNames(before, after)

  if (level === "auditor") {
    if (tier === "elevated" || tier === "restricted") {
      return { before: null, after: null, changedFields: changed }
    }
    return {
      before: before === null ? null : { redacted: true },
      after: after === null ? null : { redacted: true },
      changedFields: changed,
    }
  }

  if (level === "intermediate") {
    if (tier === "elevated" || tier === "restricted") {
      return {
        before: truncateJson(before, 400),
        after: truncateJson(after, 400),
        changedFields: changed,
      }
    }
    return {
      before: truncateJson(before, 1200),
      after: truncateJson(after, 1200),
      changedFields: changed,
    }
  }

  return {
    before: truncateJson(before, 4000),
    after: truncateJson(after, 4000),
    changedFields: changed,
  }
}
