import type { WorkspaceBillingPublicState } from "./workspace-billing-public-state.js"

export type BillingWorkspacePrimaryProductBlockCode =
  | "billing_workspace_primary_product_suspended_non_payment"
  | "billing_workspace_primary_product_commercial_terminal"

/** Bloqueo de mutaciones operativas del producto principal (impago/suscripción terminada); distinto de expansión de asientos ni permisos. */
export class BillingWorkspacePrimaryProductBlockedError extends Error {
  readonly code: BillingWorkspacePrimaryProductBlockCode
  readonly billingStatus: WorkspaceBillingPublicState["billingStatus"]
  readonly reason: "suspended_non_payment" | "commercial_terminal"

  constructor(
    code: BillingWorkspacePrimaryProductBlockCode,
    message: string,
    billingStatus: WorkspaceBillingPublicState["billingStatus"],
    reason: "suspended_non_payment" | "commercial_terminal",
  ) {
    super(message)
    this.name = "BillingWorkspacePrimaryProductBlockedError"
    this.code = code
    this.billingStatus = billingStatus
    this.reason = reason
  }

  static suspendedNonPayment(): BillingWorkspacePrimaryProductBlockedError {
    return new BillingWorkspacePrimaryProductBlockedError(
      "billing_workspace_primary_product_suspended_non_payment",
      "El workspace está suspendido por impago; las operaciones principales están limitadas hasta regularizar la facturación.",
      "suspended_non_payment",
      "suspended_non_payment",
    )
  }

  static commercialTerminal(
    billingStatus: "cancelled" | "expired",
  ): BillingWorkspacePrimaryProductBlockedError {
    return new BillingWorkspacePrimaryProductBlockedError(
      "billing_workspace_primary_product_commercial_terminal",
      billingStatus === "cancelled"
        ? "La suscripción no está activa; las operaciones principales están limitadas hasta regularizar la configuración comercial."
        : "La suscripción ha expirado; las operaciones principales están limitadas hasta renovar o regularizar.",
      billingStatus,
      "commercial_terminal",
    )
  }
}
