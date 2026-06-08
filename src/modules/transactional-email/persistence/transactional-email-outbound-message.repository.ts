import type { TransactionalTemplateKey } from "../domain/template-key.js"

export type AppendOutboundRecordInput = {
  templateKey: TransactionalTemplateKey
  toNormalized: string
  ok: boolean
  providerMessageId: string | null
  errorMessage: string | null
}

/**
 * Ledger append-only de intentos de envío (éxito o fallo tras dispatch).
 * No es cola de reintentos: cada `append` es un registro inmutable de auditoría.
 */
export interface TransactionalEmailOutboundMessageLedger {
  append(input: AppendOutboundRecordInput): Promise<void>
}
