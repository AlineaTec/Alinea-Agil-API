import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { TransactionalEmailInvalidRecipientError } from "../domain/errors.js"
import type { EmailTransport, OutboundEmailPayload, OutboundEmailResult } from "../providers/email-transport.port.js"
import type {
  AppendOutboundRecordInput,
  TransactionalEmailOutboundMessageLedger,
} from "../persistence/transactional-email-outbound-message.repository.js"
import { TransactionalEmailService } from "./transactional-email.service.js"

class MemoryLedger implements TransactionalEmailOutboundMessageLedger {
  records: AppendOutboundRecordInput[] = []
  async append(input: AppendOutboundRecordInput): Promise<void> {
    this.records.push(input)
  }
}

class MockTransport implements EmailTransport {
  payloads: OutboundEmailPayload[] = []
  async send(payload: OutboundEmailPayload): Promise<OutboundEmailResult> {
    this.payloads.push(payload)
    return { providerMessageId: "mock-msg-id" }
  }
}

describe("TransactionalEmailService", () => {
  it("envía verificación registro con transporte mockeado y registra éxito", async () => {
    const transport = new MockTransport()
    const ledger = new MemoryLedger()
    const svc = new TransactionalEmailService(transport, "agil@mail.alineatec.com", ledger)
    await svc.sendRegistrationVerificationOtp({
      toNormalizedEmail: "User@Example.com",
      code: "999888",
    })
    assert.equal(transport.payloads.length, 1)
    assert.equal(transport.payloads[0].to, "user@example.com")
    assert.match(transport.payloads[0].text, /999888/)
    assert.equal(ledger.records.length, 1)
    assert.equal(ledger.records[0].ok, true)
    assert.equal(ledger.records[0].templateKey, "registration_verification_otp")
  })

  it("rechaza destinatario inválido", async () => {
    const transport = new MockTransport()
    const ledger = new MemoryLedger()
    const svc = new TransactionalEmailService(transport, "agil@mail.alineatec.com", ledger)
    await assert.rejects(
      () => svc.sendRegistrationVerificationOtp({ toNormalizedEmail: "not-an-email", code: "1" }),
      TransactionalEmailInvalidRecipientError,
    )
  })
})
