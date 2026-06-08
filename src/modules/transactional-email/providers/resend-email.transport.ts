import { Resend } from "resend"
import type { EmailTransport, OutboundEmailPayload, OutboundEmailResult } from "./email-transport.port.js"

export class ResendEmailTransport implements EmailTransport {
  constructor(private readonly resend: Resend) {}

  async send(payload: OutboundEmailPayload): Promise<OutboundEmailResult> {
    const { data, error } = await this.resend.emails.send({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    })
    if (error) {
      throw new Error(`resend: ${error.name} — ${error.message}`)
    }
    if (!data?.id) {
      throw new Error("resend: respuesta sin id de mensaje")
    }
    return { providerMessageId: data.id }
  }
}
