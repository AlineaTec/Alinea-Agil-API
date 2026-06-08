import { TRANSACTIONAL_TEMPLATE_KEYS } from "../../domain/template-key-constants.js"

export interface TransactionalEmailOutboundMessageMessageDocProps {
  outboundPublicId: string
  templateKey: (typeof TRANSACTIONAL_TEMPLATE_KEYS)[number]
  toNormalized: string
  ok: boolean
  providerMessageId: string | null
  errorMessage: string | null
  createdAt: Date
}
