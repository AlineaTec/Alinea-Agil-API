import type { EmailTransport, OutboundEmailPayload, OutboundEmailResult } from "./email-transport.port.js"

export class NoopEmailTransport implements EmailTransport {
  async send(_payload: OutboundEmailPayload): Promise<OutboundEmailResult> {
    return { providerMessageId: "noop:disabled" }
  }
}
