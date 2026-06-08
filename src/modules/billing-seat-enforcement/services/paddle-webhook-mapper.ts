import type { PaddleCommercialSeatDerivation, PaddlePriceCatalog } from "../../commercial-pricing/paddle-price-catalog.js"
import {
  deriveCommercialSeatEntitlementFromPaddleItems,
  extractPaddleItemsArrayFromPayload,
} from "../../commercial-pricing/paddle-price-catalog.js"

export function extractWorkspacePublicIdFromCustomData(data: Record<string, unknown>): string | null {
  const cd = data.custom_data
  if (!cd || typeof cd !== "object") return null
  const w = (cd as Record<string, unknown>).workspace_public_id
  return typeof w === "string" && w.trim().length >= 12 ? w.trim() : null
}

/** @deprecated Preferir `deriveCommercialSeatEntitlementFromPaddleItems` con catálogo Paddle. */
export function sumItemQuantities(data: Record<string, unknown>): number | null {
  const items = extractPaddleItemsArrayFromPayload(data)
  if (items.length < 1) return null
  let sum = 0
  let any = false
  for (const it of items) {
    if (!it || typeof it !== "object") continue
    const q = (it as { quantity?: unknown }).quantity
    if (typeof q === "number" && Number.isFinite(q) && q >= 0) {
      sum += q
      any = true
    }
  }
  return any ? Math.floor(sum) : null
}

export function deriveTrustedEntitlementFromPaddlePayload(
  data: Record<string, unknown>,
  catalog: PaddlePriceCatalog | null,
): PaddleCommercialSeatDerivation {
  const items = extractPaddleItemsArrayFromPayload(data)
  return deriveCommercialSeatEntitlementFromPaddleItems(items, catalog)
}

export function parseOccurredAt(envelope: Record<string, unknown>): Date | null {
  const raw = envelope.occurred_at
  if (typeof raw !== "string") return null
  const d = new Date(raw)
  return Number.isFinite(d.getTime()) ? d : null
}

export function extractSubscriptionId(data: Record<string, unknown>, eventType: string): string | null {
  if (eventType.startsWith("subscription.")) {
    const id = data.id
    return typeof id === "string" ? id : null
  }
  if (eventType.startsWith("transaction.")) {
    const sid = data.subscription_id
    if (typeof sid === "string") return sid
    const ids = data.subscription_ids
    if (Array.isArray(ids) && ids.length > 0 && typeof ids[0] === "string") return ids[0]
  }
  return null
}

/**
 * Upgrade futuro sólo-Paddle: `scheduled_change` con asientos mayores que la licencia actual.
 * Usa el catálogo cuando está configurado; si no, suma legacy de `quantity`.
 */
export function extractScheduledFutureSeatIncrease(
  payload: Record<string, unknown>,
  now: Date,
  currentPurchased: number | null,
  catalog: PaddlePriceCatalog | null,
): { seats: number; effectiveAt: Date } | null {
  const sch = payload.scheduled_change
  if (!sch || typeof sch !== "object") return null
  const effRaw = (sch as { effective_at?: unknown }).effective_at
  if (typeof effRaw !== "string") return null
  const effectiveAt = new Date(effRaw)
  if (!Number.isFinite(effectiveAt.getTime()) || effectiveAt <= now) return null

  const items = extractPaddleItemsArrayFromPayload(sch as Record<string, unknown>)
  if (items.length < 1) return null

  let futureSeats: number | null
  if (!catalog) {
    const qty = sumItemQuantities({ items } as Record<string, unknown>)
    futureSeats = qty
  } else {
    const d = deriveCommercialSeatEntitlementFromPaddleItems(items, catalog)
    futureSeats = d.entitledSeats
  }

  if (futureSeats === null || futureSeats < 1) return null
  const baseline = currentPurchased ?? 0
  if (futureSeats <= baseline) return null
  return { seats: futureSeats, effectiveAt }
}
