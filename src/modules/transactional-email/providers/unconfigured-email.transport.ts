import { TransactionalEmailMisconfiguredError } from "../domain/errors.js"
import type { EmailTransport, OutboundEmailPayload, OutboundEmailResult } from "./email-transport.port.js"

/** Falla en envío: falta `RESEND_API_KEY` y no está `TRANSACTIONAL_EMAIL_DISABLED`. */
export class UnconfiguredEmailTransport implements EmailTransport {
  async send(_payload: OutboundEmailPayload): Promise<OutboundEmailResult> {
    throw new TransactionalEmailMisconfiguredError(
      "Correo transaccional no configurado: defina RESEND_API_KEY o TRANSACTIONAL_EMAIL_DISABLED=true.",
    )
  }
}
