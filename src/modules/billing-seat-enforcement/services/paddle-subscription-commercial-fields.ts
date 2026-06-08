import { loadPaddlePriceCatalogFromEnv } from "../../commercial-pricing/paddle-price-catalog.js"
import { deriveTrustedEntitlementFromPaddlePayload, sumItemQuantities } from "./paddle-webhook-mapper.js"

function parseIsoDate(v: unknown): Date | null {
  if (typeof v !== "string") return null
  const d = new Date(v)
  return Number.isFinite(d.getTime()) ? d : null
}

/**
 * Extrae campos de ciclo comercial típicos Billing API v2 (`current_billing_period`, `next_billed_at`).
 * Conservador: todo opcional; si falta estructura, devuelve nulls.
 */
export function extractPaddleCommercialCycleFields(data: Record<string, unknown>): {
  currentPeriodStartsAt: Date | null
  currentPeriodEndsAt: Date | null
  billingCycleAnchor: Date | null
} {
  const period = data.current_billing_period
  let currentPeriodStartsAt: Date | null = null
  let currentPeriodEndsAt: Date | null = null
  if (period && typeof period === "object" && !Array.isArray(period)) {
    const p = period as Record<string, unknown>
    currentPeriodStartsAt = parseIsoDate(p.starts_at)
    currentPeriodEndsAt = parseIsoDate(p.ends_at)
  }

  const nextBilled = parseIsoDate(data.next_billed_at)
  const billingCycleAnchor = nextBilled ?? currentPeriodEndsAt

  return {
    currentPeriodStartsAt,
    currentPeriodEndsAt,
    billingCycleAnchor,
  }
}

/** Huella estable para `commercialExternalSnapshot` (no payload Paddle completo). */
export function buildPaddleApiReconcileFingerprint(data: Record<string, unknown>, materializedAt: Date): string {
  const id = typeof data.id === "string" ? data.id : null
  const status = typeof data.status === "string" ? data.status : null
  const catalog = loadPaddlePriceCatalogFromEnv()
  const derived = deriveTrustedEntitlementFromPaddlePayload(data, catalog)
  const legacyQtySum = sumItemQuantities(data)
  const cycle = extractPaddleCommercialCycleFields(data)
  const sch = data.scheduled_change && typeof data.scheduled_change === "object" ? data.scheduled_change : null

  return JSON.stringify({
    kind: "paddle_api_reconcile",
    materializedAt: materializedAt.toISOString(),
    subscriptionId: id,
    paddleStatus: status,
    derivedEntitledSeats: derived.entitledSeats,
    derivedPlanKind: derived.planKind,
    entitlementIssues: derived.issues,
    usedLegacyQuantitySum: derived.usedLegacyQuantitySum,
    legacyItemsQuantitySum: legacyQtySum,
    teamBaseQuantityObserved: derived.teamBaseQuantityObserved,
    currentBillingPeriod: {
      startsAt: cycle.currentPeriodStartsAt?.toISOString() ?? null,
      endsAt: cycle.currentPeriodEndsAt?.toISOString() ?? null,
    },
    nextBilledAt:
      typeof data.next_billed_at === "string"
        ? data.next_billed_at
        : data.next_billed_at === null
          ? null
          : undefined,
    scheduledChangePresent: sch !== null,
  })
}
