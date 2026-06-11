/**
 * Puerto: envío de correo transaccional (OTP, notificaciones de registro).
 * Implementación: `RegistrationTransactionalEmailAdapter` → `TransactionalEmailService`.
 */
export interface TransactionalEmailPort {
  sendRegistrationVerificationEmail(_params: {
    toNormalizedEmail: string
    codeOrLink: string
    locale?: string
  }): Promise<void>

  /** Tras pago simulado exitoso (best-effort en el orquestador). */
  sendRegistrationPaymentConfirmation(_params: {
    toNormalizedEmail: string
    intentPublicId: string
    workspaceDisplayName?: string
    workspaceCode?: string
    modality?: string
    billingCadence?: string
  }): Promise<void>

  /** Tras activación exitosa del workspace (provisioning completado). */
  sendRegistrationWelcome(_params: {
    toNormalizedEmail: string
    accountFullName: string
    workspaceDisplayName: string
    workspaceCode?: string | null
    planTier?: string
  }): Promise<void>
}

export class NoopTransactionalEmail implements TransactionalEmailPort {
  async sendRegistrationVerificationEmail(): Promise<void> {
    /* noop */
  }

  async sendRegistrationPaymentConfirmation(): Promise<void> {
    /* noop */
  }

  async sendRegistrationWelcome(): Promise<void> {
    /* noop */
  }
}
