export type OutboundEmailPayload = {
  from: string
  to: string
  subject: string
  html: string
  text: string
}

export type OutboundEmailResult = {
  providerMessageId: string
}

export interface EmailTransport {
  send(payload: OutboundEmailPayload): Promise<OutboundEmailResult>
}
