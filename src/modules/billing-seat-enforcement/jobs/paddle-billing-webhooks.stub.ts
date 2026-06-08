/**
 * Jobs futuros (colas, reconciliación batch, alertas).
 *
 * La ingesta **HTTP** vive en `routes/paddle-webhooks.routes.ts` → `POST /v1/integrations/paddle/webhooks`
 * (`PaddleBillingWebhookIngestionService`).
 */

export const paddleBillingWebhookJobsStubNote =
  "billing-seat-enforcement: webhooks Paddle firmados ingieren en POST /v1/integrations/paddle/webhooks; jobs batch pueden llamar WorkspaceBillingStateService.runManualLicenseReconcile."
