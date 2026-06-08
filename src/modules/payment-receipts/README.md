# Módulo `payment-receipts`

Propósito: **recibos de pago por transacción** tras confirmación confiable de cobro (v1: **`transaction.completed`** en Paddle). Consume el estado de billing y la reconciliación existentes; **no** redefine entitlement, **no** sustituye el portal Paddle ni la facturación fiscal formal.

## Recibo vs factura fiscal

Este documento **acredita la recepción del pago** según el proveedor de cobros. Incluye disclaimer explícito: **no sustituye factura fiscal** u otro comprobante cuando la normativa exija otro tipo de documento.

## Disparo de emisión (v1)

- Automático **solo** si `billingSource = paddle` en el snapshot del workspace.
- Desde `PaddleBillingWebhookIngestionService`, tras procesar `transaction.completed` con workspace resuelto (emisión también corre si hay conflicto de invariante de asientos tras el pago, antes de devolver `seat_invariant_conflict`).
- **`billingSource = manual`**: sin emisión automática; modelo persistido permite futura operación manual.
- **Transacción huérfana** (sin `workspace_public_id` ni suscripción vinculada en snapshot): **no** se crea recibo; se deja registro en `PaymentReceiptOrphanEvent` para revisión operativa.

## Campos principales (persistencia)

Ver `WorkspacePaymentReceipt` / `WorkspacePaymentReceiptProps`: `receiptPublicId`, `receiptNumber` (numeración global `ALN-REC-YYYY-######`), `workspacePublicId`, `billingSource`, `paymentProvider`, `providerTransactionId`, importes en **unidad menor** (`amountPaidMinor`, `subtotalMinor`, `taxAmountMinor` si Paddle expone impuestos claramente), plan/resumen de asientos, período si aplica, metadatos PDF/email y `sourceEventId` / `sourceEventType`.

## Dedupe

Índice único `(paymentProvider, providerTransactionId)`. Reintentos de webhook o reconciliaciones posteriores **no** duplican filas; la segunda emisión devuelve idempotencia (`duplicate`).

## PDF y almacenamiento

- Generación con **pdfkit**, texto fijo **es-ES**.
- Archivos en disco bajo `PAYMENT_RECEIPT_STORAGE_DIR` o, por defecto, `var/payment-receipts/` bajo el cwd del proceso.
- Si falla la generación inicial, el recibo puede quedar en `document_pending`; la descarga autenticada puede **regenerar** el binario (mismo `receiptPublicId` y `receiptNumber`), con auditoría `payment_receipt_pdf_regenerated`.

## Descarga

Solo vía **API autenticada** (streaming PDF), sin URL pública firmada.

## Email

Plantilla `workspace_payment_receipt`: enlace al hub de facturación (o mensaje genérico si no hay `WORKSPACE_APP_PUBLIC_BASE_URL`). **Sin adjunto PDF**. Fallo de envío **no** borra el recibo; se audita `payment_receipt_email_failed`.

## Limitaciones v1 / postergado

- Reembolsos automáticos y lógica fiscal formal.
- Multi-proveedor real fuera de Paddle (campos `paymentProvider` / `providerTransactionId` ya preparados).
- Emisión automática para billing manual.
- URLs firmadas públicas y versionado visible del documento.

## Endpoints

**Workspace** (misma barra que portal/checkout: admin/operador del workspace):

- `GET /v1/workspaces/:workspacePublicId/billing/receipts`
- `GET /v1/workspaces/:workspacePublicId/billing/receipts/:receiptPublicId`
- `GET /v1/workspaces/:workspacePublicId/billing/receipts/:receiptPublicId/download`

**Plataforma** (sesión plataforma, lectura acorde a `assertPlatformSessionCanReadTenants`):

- `GET /v1/platform/billing/receipts`
- `GET /v1/platform/billing/receipts/:receiptPublicId`
- `GET /v1/platform/billing/receipts/:receiptPublicId/download`

## Auditoría de billing

Eventos añadidos al modelo de auditoría de workspace billing: `payment_receipt_emitted`, `payment_receipt_skipped`, `payment_receipt_duplicate_blocked`, `payment_receipt_email_failed`, `payment_receipt_pdf_regenerated` (y huérfanos en colección dedicada).
