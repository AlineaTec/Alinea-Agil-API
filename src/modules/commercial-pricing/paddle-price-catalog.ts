import type { BillingCadence, CommercialPlanKind } from "./commercial-pricing.constants.js"

/**
 * Mapeo explícito price_id Paddle → rol comercial (contrato `contracts-docs` billing-seat-enforcement).
 * IDs reales vía variables de entorno (`PADDLE_PRICE_*`).
 */
export type PaddlePriceRole =
  | { productRole: "individual"; interval: BillingCadence }
  | { productRole: "team_base"; interval: BillingCadence }
  | { productRole: "additional_seat"; interval: BillingCadence }

export type PaddlePriceCatalog = {
  /** price_id → semántica */
  byPriceId: ReadonlyMap<string, PaddlePriceRole>
  individualMonthly: string
  individualAnnual: string
  teamBaseMonthly: string
  teamBaseAnnual: string
  additionalSeatMonthly: string
  additionalSeatAnnual: string
}

export type PaddleCommercialSeatDerivation = {
  entitledSeats: number | null
  planKind: CommercialPlanKind | null
  billingIntervals: BillingCadence[]
  /** Team Base quantity observada (solo team); si ≠ 1 → issue auditable, no sumar como seats extra */
  teamBaseQuantityObserved: number | null
  issues: string[]
  /** Catálogo no configurado o items sin price_id reconocible: suma legacy de quantity */
  usedLegacyQuantitySum: boolean
}

function entry(map: Map<string, PaddlePriceRole>, priceId: string, role: PaddlePriceRole): void {
  const k = priceId.trim()
  if (!k) return
  map.set(k, role)
}

/**
 * Carga el catálogo si están las **6** variables; si falta alguna devuelve `null` (modo legacy).
 */
export function loadPaddlePriceCatalogFromEnv(): PaddlePriceCatalog | null {
  const individualMonthly = process.env.PADDLE_PRICE_INDIVIDUAL_MONTHLY?.trim() ?? ""
  const individualAnnual = process.env.PADDLE_PRICE_INDIVIDUAL_ANNUAL?.trim() ?? ""
  const teamBaseMonthly = process.env.PADDLE_PRICE_TEAM_BASE_MONTHLY?.trim() ?? ""
  const teamBaseAnnual = process.env.PADDLE_PRICE_TEAM_BASE_ANNUAL?.trim() ?? ""
  const additionalSeatMonthly = process.env.PADDLE_PRICE_ADDITIONAL_SEAT_MONTHLY?.trim() ?? ""
  const additionalSeatAnnual = process.env.PADDLE_PRICE_ADDITIONAL_SEAT_ANNUAL?.trim() ?? ""

  const all = [
    individualMonthly,
    individualAnnual,
    teamBaseMonthly,
    teamBaseAnnual,
    additionalSeatMonthly,
    additionalSeatAnnual,
  ]
  if (all.some((s) => !s)) return null

  const byPriceId = new Map<string, PaddlePriceRole>()
  entry(byPriceId, individualMonthly, { productRole: "individual", interval: "monthly" })
  entry(byPriceId, individualAnnual, { productRole: "individual", interval: "annual" })
  entry(byPriceId, teamBaseMonthly, { productRole: "team_base", interval: "monthly" })
  entry(byPriceId, teamBaseAnnual, { productRole: "team_base", interval: "annual" })
  entry(byPriceId, additionalSeatMonthly, { productRole: "additional_seat", interval: "monthly" })
  entry(byPriceId, additionalSeatAnnual, { productRole: "additional_seat", interval: "annual" })

  return {
    byPriceId,
    individualMonthly,
    individualAnnual,
    teamBaseMonthly,
    teamBaseAnnual,
    additionalSeatMonthly,
    additionalSeatAnnual,
  }
}

export function resolvePriceRoleInCatalog(
  catalog: PaddlePriceCatalog,
  priceId: string | null,
): PaddlePriceRole | null {
  if (!priceId) return null
  return catalog.byPriceId.get(priceId.trim()) ?? null
}

/** Útil en tests — mismas reglas que env, sin leer proceso */
export function createPaddlePriceCatalogForTests(ids: {
  individualMonthly: string
  individualAnnual: string
  teamBaseMonthly: string
  teamBaseAnnual: string
  additionalSeatMonthly: string
  additionalSeatAnnual: string
}): PaddlePriceCatalog {
  const byPriceId = new Map<string, PaddlePriceRole>()
  entry(byPriceId, ids.individualMonthly, { productRole: "individual", interval: "monthly" })
  entry(byPriceId, ids.individualAnnual, { productRole: "individual", interval: "annual" })
  entry(byPriceId, ids.teamBaseMonthly, { productRole: "team_base", interval: "monthly" })
  entry(byPriceId, ids.teamBaseAnnual, { productRole: "team_base", interval: "annual" })
  entry(byPriceId, ids.additionalSeatMonthly, { productRole: "additional_seat", interval: "monthly" })
  entry(byPriceId, ids.additionalSeatAnnual, { productRole: "additional_seat", interval: "annual" })
  return {
    byPriceId,
    individualMonthly: ids.individualMonthly,
    individualAnnual: ids.individualAnnual,
    teamBaseMonthly: ids.teamBaseMonthly,
    teamBaseAnnual: ids.teamBaseAnnual,
    additionalSeatMonthly: ids.additionalSeatMonthly,
    additionalSeatAnnual: ids.additionalSeatAnnual,
  }
}

function coerceRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || v === undefined) return null
  if (typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>
  return null
}

export function extractPriceIdFromPaddleItemLike(item: unknown): string | null {
  const o = coerceRecord(item)
  if (!o) return null
  const direct = o.price_id
  if (typeof direct === "string" && direct.trim()) return direct.trim()
  const price = o.price
  if (typeof price === "string" && price.trim()) return price.trim()
  const pr = coerceRecord(price)
  const nested = pr?.id
  if (typeof nested === "string" && nested.trim()) return nested.trim()
  return null
}

export function extractQuantityFromPaddleItemLike(item: unknown): number {
  const o = coerceRecord(item)
  if (!o) return 0
  const q = o.quantity
  if (typeof q === "number" && Number.isFinite(q) && q >= 0) return Math.floor(q)
  return 0
}

function legacySumQuantities(items: unknown[]): { sum: number; any: boolean } {
  let sum = 0
  let any = false
  for (const it of items) {
    const q = extractQuantityFromPaddleItemLike(it)
    if (q > 0 || (coerceRecord(it) && "quantity" in (coerceRecord(it) as object))) {
      any = true
    }
    sum += q
  }
  return { sum, any }
}

/**
 * Deriva `entitledSeats` alineado a: Individual=1; Team=3+addon; Team Base qty≠1 no añade asientos.
 * Si `catalog === null`: suma legacy de quantities (compatibilidad suscripciones antiguas).
 */
export function deriveCommercialSeatEntitlementFromPaddleItems(
  items: unknown[] | null | undefined,
  catalog: PaddlePriceCatalog | null,
): PaddleCommercialSeatDerivation {
  const issues: string[] = []
  if (!Array.isArray(items) || items.length === 0) {
    return {
      entitledSeats: null,
      planKind: null,
      billingIntervals: [],
      teamBaseQuantityObserved: null,
      issues: ["no_items"],
      usedLegacyQuantitySum: false,
    }
  }

  if (!catalog) {
    const { sum, any } = legacySumQuantities(items)
    if (!any || sum < 1) {
      return {
        entitledSeats: null,
        planKind: null,
        billingIntervals: [],
        teamBaseQuantityObserved: null,
        issues: ["legacy_no_quantities"],
        usedLegacyQuantitySum: true,
      }
    }
    return {
      entitledSeats: sum,
      planKind: null,
      billingIntervals: [],
      teamBaseQuantityObserved: null,
      issues: ["legacy_quantity_sum_no_price_semantics"],
      usedLegacyQuantitySum: true,
    }
  }

  const classified: Array<{ priceId: string; role: PaddlePriceRole; qty: number }> = []
  for (const it of items) {
    const priceId = extractPriceIdFromPaddleItemLike(it)
    const qty = extractQuantityFromPaddleItemLike(it)
    if (!priceId) {
      return {
        entitledSeats: null,
        planKind: null,
        billingIntervals: [],
        teamBaseQuantityObserved: null,
        issues: ["strict_missing_price_id_on_item"],
        usedLegacyQuantitySum: false,
      }
    }
    const role = resolvePriceRoleInCatalog(catalog, priceId)
    if (!role) {
      return {
        entitledSeats: null,
        planKind: null,
        billingIntervals: [],
        teamBaseQuantityObserved: null,
        issues: [`unknown_price_id:${priceId}`],
        usedLegacyQuantitySum: false,
      }
    }
    classified.push({ priceId, role, qty })
  }

  const intervals = [...new Set(classified.map((c) => c.role.interval))]
  if (intervals.length > 1) {
    return {
      entitledSeats: null,
      planKind: null,
      billingIntervals: intervals,
      teamBaseQuantityObserved: null,
      issues: ["mixed_billing_interval_monthly_and_annual"],
      usedLegacyQuantitySum: false,
    }
  }

  const hasInd = classified.some((c) => c.role.productRole === "individual")
  const hasBase = classified.some((c) => c.role.productRole === "team_base")
  const hasAddon = classified.some((c) => c.role.productRole === "additional_seat")

  if (hasInd && (hasBase || hasAddon)) {
    return {
      entitledSeats: null,
      planKind: null,
      billingIntervals: intervals,
      teamBaseQuantityObserved: null,
      issues: ["conflicting_individual_and_team_lines"],
      usedLegacyQuantitySum: false,
    }
  }

  if (hasInd) {
    if (classified.length !== 1) {
      issues.push("individual_multiple_items")
    }
    const row = classified[0]
    if (row && row.role.productRole === "individual" && row.qty !== 1) {
      issues.push("individual_quantity_must_be_1")
    }
    return {
      entitledSeats: 1,
      planKind: "individual",
      billingIntervals: intervals,
      teamBaseQuantityObserved: null,
      issues,
      usedLegacyQuantitySum: false,
    }
  }

  const baseRows = classified.filter((c) => c.role.productRole === "team_base")
  const addonRows = classified.filter((c) => c.role.productRole === "additional_seat")

  if (baseRows.length > 1) {
    return {
      entitledSeats: null,
      planKind: "team",
      billingIntervals: intervals,
      teamBaseQuantityObserved: baseRows[0]?.qty ?? null,
      issues: ["multiple_team_base_lines"],
      usedLegacyQuantitySum: false,
    }
  }

  if (baseRows.length === 0 && addonRows.length > 0) {
    return {
      entitledSeats: null,
      planKind: "team",
      billingIntervals: intervals,
      teamBaseQuantityObserved: null,
      issues: ["team_addon_without_team_base"],
      usedLegacyQuantitySum: false,
    }
  }

  let teamBaseQty = 0
  if (baseRows.length === 1) {
    teamBaseQty = baseRows[0]!.qty
    if (teamBaseQty !== 1) {
      issues.push("team_base_quantity_not_one")
    }
  }

  const additionalSeatQty = addonRows.reduce((a, r) => a + r.qty, 0)
  const entitled = 3 + additionalSeatQty

  return {
    entitledSeats: entitled,
    planKind: "team",
    billingIntervals: intervals,
    teamBaseQuantityObserved: baseRows.length === 1 ? teamBaseQty : null,
    issues,
    usedLegacyQuantitySum: false,
  }
}

export function extractPaddleItemsArrayFromPayload(data: Record<string, unknown>): unknown[] {
  const direct = data.items
  if (Array.isArray(direct)) return direct
  const details = coerceRecord(data.details)
  if (details) {
    const di = details.items
    if (Array.isArray(di)) return di
    const li = details.line_items
    if (Array.isArray(li)) return li
  }
  const lineItems = data.line_items
  if (Array.isArray(lineItems)) return lineItems
  return []
}
