/**
 * Fase F — pago **simulado** (sin proveedor ni PCI).
 *
 * `simulatedOutcome` en el cuerpo del request permite pruebas explícitas; con integración
 * real de pasarela este endpoint debería sustituirse o quedar solo en entornos internos **[P]**.
 *
 * `PAYMENT_PENDING` existe en dominio para futuros flujos asíncronos; esta operación va
 * directo a `PAYMENT_SUCCEEDED` o `PAYMENT_FAILED` (sin cola intermedia).
 */
export const SIMULATED_PAYMENT_OUTCOMES = [
  "success",
  "declined",
  "provider_error",
] as const

export type SimulatedPaymentOutcome =
  (typeof SIMULATED_PAYMENT_OUTCOMES)[number]
