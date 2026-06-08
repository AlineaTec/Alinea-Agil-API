/** Facturación manual enterprise — sin Paddle Customer Portal. */
export class WorkspaceBillingPortalManualBillingError extends Error {
  readonly code = "workspace_billing_portal_manual_billing" as const

  constructor(
    message = "Este workspace tiene facturación manual; contacta a tu canal comercial para regularizar cobros o capacidad.",
  ) {
    super(message)
    this.name = "WorkspaceBillingPortalManualBillingError"
  }
}

/** Snapshot Paddle sin suscripción vinculada (`subscriptionExternalId`). */
export class WorkspaceBillingPortalMissingLinkError extends Error {
  readonly code = "workspace_billing_portal_missing_paddle_link" as const

  constructor(
    message = "Aún no hay una suscripción Paddle vinculada a este workspace; contacta a soporte si el cobro ya existe.",
  ) {
    super(message)
    this.name = "WorkspaceBillingPortalMissingLinkError"
  }
}

/** Campos útiles de la respuesta de error de Paddle Billing (`error` + `meta.request_id`). */
export type PaddlePortalUpstreamError = {
  code?: string
  detail?: string
  requestId?: string
}

/** Configuración Paddle incompleta (`PADDLE_API_KEY`) o API Paddle no disponible. */
export class WorkspaceBillingPortalPaddleUnavailableError extends Error {
  readonly code = "workspace_billing_portal_paddle_unavailable" as const

  constructor(
    message: string,
    readonly paddleHttpStatus?: number,
    readonly paddleApiError?: PaddlePortalUpstreamError,
  ) {
    super(message)
    this.name = "WorkspaceBillingPortalPaddleUnavailableError"
  }
}
