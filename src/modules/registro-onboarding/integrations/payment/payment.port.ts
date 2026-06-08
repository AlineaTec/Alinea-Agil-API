/**
 * Puerto: pasarela de pago (Fase F).
 * Implementación real: pendiente (open-questions.md).
 */
export interface RegistrationPaymentPort {
  /** TODO [P]: crear sesión de checkout / PaymentIntent según proveedor. */
  createCheckoutSession(_params: {
    intentPublicId: string
    amountMinorUnits?: number
    currency?: string
  }): Promise<{ externalRef: string }>
}

export class NoopRegistrationPayment implements RegistrationPaymentPort {
  async createCheckoutSession(): Promise<{ externalRef: string }> {
    return { externalRef: "noop" }
  }
}
