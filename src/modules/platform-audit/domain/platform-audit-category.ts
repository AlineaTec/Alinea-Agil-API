import type { PlatformAuditAction } from "../../platform-users/domain/platform-audit-action.js"

/** Categorías v1 (extensión aditiva). */
export const PLATFORM_AUDIT_CATEGORIES = [
  "platform_identity",
  "platform_tenant",
  /** Billing reconcile manual, borrado/purge de intents de registro, etc. */
  "platform_operations",
  /** Reservado para futuras mutaciones de licencias desde plataforma; «resto» no clasificado. */
  "platform_licensing",
] as const

export type PlatformAuditCategory = (typeof PLATFORM_AUDIT_CATEGORIES)[number]

const IDENTITY_ACTIONS = new Set<PlatformAuditAction>([
  "platform_user.invited",
  "platform_user.profile_updated",
  "platform_user.activated",
  "platform_user.deactivated",
  "platform_user.role_changed",
  "platform_user.mfa_enrollment_started",
  "platform_user.mfa_enrolled",
  "platform_user.mfa_lockout",
  "platform_user.password_set",
])

const TENANT_ACTIONS = new Set<PlatformAuditAction>(["tenant.suspended", "tenant.reactivated"])

/** Acciones de operaciones internas (facturación/registro) visibles en auditoría de plataforma. */
export const PLATFORM_OPERATIONS_AUDIT_ACTIONS = [
  "billing.workspace_paddle_reconcile",
  "registration.intents_deleted",
  "registration.intents_purge_unprovisioned",
] as const satisfies readonly PlatformAuditAction[]

const OPERATIONS_ACTIONS = new Set<PlatformAuditAction>(PLATFORM_OPERATIONS_AUDIT_ACTIONS)

/** Todas las acciones con categoría explícita distinta de `platform_licensing`. */
export function platformAuditActionsExcludedFromLicensingCategory(): PlatformAuditAction[] {
  return [...IDENTITY_ACTIONS, ...TENANT_ACTIONS, ...OPERATIONS_ACTIONS]
}

export function platformAuditCategoryForAction(action: PlatformAuditAction): PlatformAuditCategory {
  if (IDENTITY_ACTIONS.has(action)) return "platform_identity"
  if (TENANT_ACTIONS.has(action)) return "platform_tenant"
  if (OPERATIONS_ACTIONS.has(action)) return "platform_operations"
  return "platform_licensing"
}

export function platformAuditActionsForCategory(category: PlatformAuditCategory): PlatformAuditAction[] {
  if (category === "platform_identity") return [...IDENTITY_ACTIONS]
  if (category === "platform_tenant") return [...TENANT_ACTIONS]
  if (category === "platform_operations") return [...PLATFORM_OPERATIONS_AUDIT_ACTIONS]
  return []
}
