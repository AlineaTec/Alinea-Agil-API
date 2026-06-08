/** Errores HTTP del módulo recibos (contratos explícitos v1). */
export class PaymentReceiptNotFoundError extends Error {
  readonly code = "payment_receipt_not_found"

  constructor(message = "Recibo no encontrado.") {
    super(message)
    this.name = "PaymentReceiptNotFoundError"
  }
}

export class PaymentReceiptWorkspaceMismatchError extends Error {
  readonly code = "payment_receipt_workspace_mismatch"

  constructor(message = "El recibo no pertenece a este workspace.") {
    super(message)
    this.name = "PaymentReceiptWorkspaceMismatchError"
  }
}

export class PaymentReceiptBillingSourceUnsupportedError extends Error {
  readonly code = "payment_receipt_billing_source_unsupported"

  constructor(message = "Facturación manual no admite recibos automáticos en esta operación.") {
    super(message)
    this.name = "PaymentReceiptBillingSourceUnsupportedError"
  }
}

export class PaymentReceiptProviderTransactionUnresolvedError extends Error {
  readonly code = "payment_receipt_provider_transaction_unresolved"

  constructor(message = "No se pudo resolver el identificador de transacción del proveedor.") {
    super(message)
    this.name = "PaymentReceiptProviderTransactionUnresolvedError"
  }
}

export class PaymentReceiptOrphanTransactionError extends Error {
  readonly code = "payment_receipt_orphan_transaction"

  constructor(message = "Transacción sin workspace resuelto; requiere revisión operativa.") {
    super(message)
    this.name = "PaymentReceiptOrphanTransactionError"
  }
}

export class PaymentReceiptDocumentUnavailableError extends Error {
  readonly code = "payment_receipt_document_unavailable"

  constructor(message = "El documento PDF aún no está disponible.") {
    super(message)
    this.name = "PaymentReceiptDocumentUnavailableError"
  }
}

export class PaymentReceiptRenderError extends Error {
  readonly code = "payment_receipt_render_failed"

  constructor(message = "Fallo al generar el PDF del recibo.") {
    super(message)
    this.name = "PaymentReceiptRenderError"
  }
}

export class PaymentReceiptAccessDeniedError extends Error {
  readonly code = "payment_receipt_access_denied"

  constructor(message = "No autorizado para acceder a recibos de pago.") {
    super(message)
    this.name = "PaymentReceiptAccessDeniedError"
  }
}

export class PaymentReceiptDuplicateEmissionError extends Error {
  readonly code = "payment_receipt_duplicate_emission_blocked"

  constructor(message = "Emisión duplicada bloqueada (idempotencia).") {
    super(message)
    this.name = "PaymentReceiptDuplicateEmissionError"
  }
}
