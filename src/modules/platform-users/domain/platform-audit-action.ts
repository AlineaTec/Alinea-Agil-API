export type PlatformAuditAction =
  | "platform_user.invited"
  | "platform_user.profile_updated"
  | "platform_user.activated"
  | "platform_user.deactivated"
  | "platform_user.role_changed"
  | "platform_user.mfa_enrollment_started"
  | "platform_user.mfa_enrolled"
  | "platform_user.mfa_lockout"
  | "platform_user.password_set"
  | "tenant.suspended"
  | "tenant.reactivated"
  /** Operador/admin ejecutó reconciliación Paddle puntual sobre un workspace (`billing-seat-enforcement`). */
  | "billing.workspace_paddle_reconcile"
  /** Borrado explícito de intents de registro desde admin de plataforma. */
  | "registration.intents_deleted"
  /** Purga masiva de intents sin workspace provisionado. */
  | "registration.intents_purge_unprovisioned"
