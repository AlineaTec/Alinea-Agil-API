/** Errores de dominio para orquestación comercial Paddle (contratos HTTP estables). */
export class WorkspaceCommercialSubscriptionError extends Error {
  readonly name = "WorkspaceCommercialSubscriptionError"

  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number = 400,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
  }
}
