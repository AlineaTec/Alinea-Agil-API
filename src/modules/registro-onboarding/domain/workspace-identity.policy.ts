/**
 * Reglas de nombre y código de workspace (Fases C–D).
 * Alineadas de forma conservadora con el mock `web` (`workspaceIdentity.ts`)
 * hasta cierre **[P]** en contracts-docs.
 */
import type { IdentityRegistrationIntentStatus } from "./registration-status.js"

export const WORKSPACE_CODE_LENGTH_RULES = {
  min: 3,
  max: 40,
} as const

export const WORKSPACE_DISPLAY_NAME_RULES = {
  min: 2,
  max: 100,
} as const

/** Slug: minúsculas, números, guiones internos. */
const WORKSPACE_CODE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Estados en los que el `workspaceCode` del intento cuenta como «ocupado»
 * para pre-checks provisionales (no es creación definitiva del tenant).
 */
export const REGISTRATION_STATUSES_CLAIMING_WORKSPACE_CODE: readonly IdentityRegistrationIntentStatus[] =
  [
    "WORKSPACE_PROPOSED",
    "CREDENTIALS_SET",
    "PAYMENT_PENDING",
    "PAYMENT_FAILED",
    "PAYMENT_SUCCEEDED",
    "PROVISIONING",
    "ACTIVE",
  ]

const DEFAULT_RESERVED_SLUGS = [
  "admin",
  "administrator",
  "alinea",
  "api",
  "demo",
  "mail",
  "ocupado",
  "reservado",
  "root",
  "support",
  "taken",
  "www",
] as const

export function normalizeWorkspaceCode(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_+/g, "-")
}

export function normalizeWorkspaceDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ")
}

/**
 * `null` si el formato es válido; mensaje solo para debugging/logs (no exponer tal cual en API si no se desea).
 */
export function getWorkspaceCodeFormatIssue(normalized: string): string | null {
  if (normalized.length < WORKSPACE_CODE_LENGTH_RULES.min) {
    return `min_length_${WORKSPACE_CODE_LENGTH_RULES.min}`
  }
  if (normalized.length > WORKSPACE_CODE_LENGTH_RULES.max) {
    return `max_length_${WORKSPACE_CODE_LENGTH_RULES.max}`
  }
  if (!WORKSPACE_CODE_SLUG_PATTERN.test(normalized)) {
    return "slug_charset"
  }
  return null
}

export function getWorkspaceDisplayNameFormatIssue(
  trimmedName: string,
): string | null {
  if (trimmedName.length < WORKSPACE_DISPLAY_NAME_RULES.min) {
    return `min_length_${WORKSPACE_DISPLAY_NAME_RULES.min}`
  }
  if (trimmedName.length > WORKSPACE_DISPLAY_NAME_RULES.max) {
    return `max_length_${WORKSPACE_DISPLAY_NAME_RULES.max}`
  }
  return null
}

/**
 * Lista global reservada + variable `REGISTRATION_RESERVED_WORKSPACE_CODES` (coma).
 */
export function loadReservedWorkspaceCodesNormalized(): Set<string> {
  const set = new Set<string>()
  for (const s of DEFAULT_RESERVED_SLUGS) {
    set.add(s)
  }
  const extra = process.env.REGISTRATION_RESERVED_WORKSPACE_CODES ?? ""
  for (const part of extra.split(",")) {
    const n = normalizeWorkspaceCode(part)
    if (n.length > 0) set.add(n)
  }
  return set
}
