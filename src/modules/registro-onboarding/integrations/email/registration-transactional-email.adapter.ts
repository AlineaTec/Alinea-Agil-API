import type { TransactionalEmailService } from "../../../transactional-email/services/transactional-email.service.js"
import type { TransactionalEmailPort } from "./transactional-email.port.js"

/**
 * Adapta el puerto histórico del módulo de registro al servicio central de correo.
 */
export class RegistrationTransactionalEmailAdapter implements TransactionalEmailPort {
  constructor(private readonly inner: TransactionalEmailService) {}

  async sendRegistrationVerificationEmail(params: {
    toNormalizedEmail: string
    codeOrLink: string
    locale?: string
  }): Promise<void> {
    void params.locale
    await this.inner.sendRegistrationVerificationOtp({
      toNormalizedEmail: params.toNormalizedEmail,
      code: params.codeOrLink,
    })
  }

  async sendRegistrationPaymentConfirmation(params: {
    toNormalizedEmail: string
    intentPublicId: string
    workspaceDisplayName?: string
    workspaceCode?: string
    modality?: string
    billingCadence?: string
  }): Promise<void> {
    await this.inner.sendRegistrationPaymentConfirmation(params)
  }
}
