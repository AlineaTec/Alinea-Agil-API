/** Snapshot material existe pero marca migración inicial pendiente sólo después sync explícito. */

export class WorkspaceBillingNotFoundError extends Error {
  readonly code = "workspace_billing_snapshot_not_found"
  constructor(message = "Billing snapshot not materialized for workspace.") {
    super(message)
    this.name = "WorkspaceBillingNotFoundError"
  }
}

export class WorkspaceBillingUnsupportedSourceError extends Error {
  readonly code = "workspace_billing_unsupported_source"
  constructor(public readonly billingSource: string) {
    super(`Unsupported billing source: ${billingSource}`)
    this.name = "WorkspaceBillingUnsupportedSourceError"
  }
}

export class WorkspaceBillingInvariantError extends Error {
  readonly code = "workspace_billing_invariant"

  constructor(message: string) {
    super(message)
    this.name = "WorkspaceBillingInvariantError"
  }
}
