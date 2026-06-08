/**
 * Estado comercial / ciclo de vida (**materializado internamente** — no Paddle en tiempo real por request).
 * Alineado a `contracts-docs/.../billing-state-model.md` y decisiones v1 cerradas.
 */
export const WORKSPACE_BILLING_STATUSES = [
  /** Cobro recurrente al día según última sincronización. */
  "active",
  /** Fallo materializado (`payment_action_required` equivalente); inicio ventana gracia (**v1**). */
  "payment_action_required",
  /** Dentro de los 15 días calendario posteriores al inicio documentado en `gracePeriodStartsAt`. */
  "grace_period",
  /** Tras superar la gracia sin regularizar (**v1** suspensión operativa parcial; billing accesible). */
  "suspended_non_payment",
  "cancelled",
  "expired",
] as const

export type WorkspaceBillingStatus = (typeof WORKSPACE_BILLING_STATUSES)[number]

export const BILLING_SOURCES = ["paddle", "manual"] as const

export type BillingSource = (typeof BILLING_SOURCES)[number]
