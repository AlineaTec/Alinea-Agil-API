/** Cadencia activa para nuevas suscripciones y cotizaciones. */
export type ActiveBillingCadence = "monthly"

/** Valores persistidos (p. ej. intents antiguos o recibos históricos). */
export type StoredBillingCadence = "monthly" | "annual"

export const ACTIVE_BILLING_CADENCE: ActiveBillingCadence = "monthly"

/** Normaliza cualquier entrada de cliente a mensual (anual descontinuado). */
export function resolveActiveBillingCadence(_input?: string | null): ActiveBillingCadence {
  return ACTIVE_BILLING_CADENCE
}

/** Lectura histórica: filas legacy `annual` se tratan como mensual en runtime. */
export function normalizeStoredBillingCadence(
  cadence: StoredBillingCadence | null | undefined,
): ActiveBillingCadence | undefined {
  if (cadence === "monthly" || cadence === "annual") return ACTIVE_BILLING_CADENCE
  return undefined
}
