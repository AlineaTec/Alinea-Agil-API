import type { BillingCadence, CommercialPlanKind } from "./commercial-pricing.constants.js"

/**
 * Mapeo explícito price_id Paddle → rol comercial (contrato `contracts-docs` billing-seat-enforcement).
 * IDs reales vía variables de entorno (`PADDLE_PRICE_*`).
 */
export type PaddlePriceRole =
  | { productRole: "individual"; interval: BillingCadence }
  | { productRole: "team_base"; interval: BillingCadence }
  | { productRole: "additional_seat"; interval: BillingCadence }
  | { productRole: "estandar_license"; interval: BillingCadence }
  | { productRole: "profesional_license"; interval: BillingCadence }

export type PaddlePriceCatalog = {
  /** price_id → semántica */
  byPriceId: ReadonlyMap<string, PaddlePriceRole>
  individualMonthly: string
  teamBaseMonthly: string
  additionalSeatMonthly: string
  estandarLicenseMonthly: string
  profesionalLicenseMonthly: string
  /** Catálogo con precios por licencia Estándar/Profesional (sin base 3 + addon). */
  tierPerSeatModel: boolean
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
 * Carga el catálogo si están las variables mensuales requeridas; si falta alguna devuelve `null` (modo legacy).
 */
function readPaddlePriceEnv(primary: string, legacy?: string): string {
  const v = process.env[primary]?.trim() ?? ""
  if (v) return v
  if (legacy) return process.env[legacy]?.trim() ?? ""
  return ""
}

export function loadPaddlePriceCatalogFromEnv(): PaddlePriceCatalog | null {
  const estandarLicenseMonthly = readPaddlePriceEnv(
    "PADDLE_PRICE_ESTANDAR_LICENSE_MONTHLY",
    "PADDLE_PRICE_TEAM_LICENSE_MONTHLY",
  )
  const profesionalLicenseMonthly = readPaddlePriceEnv(
    "PADDLE_PRICE_PROFESIONAL_LICENSE_MONTHLY",
    "PADDLE_PRICE_PRO_LICENSE_MONTHLY",
  )
  const tierPerSeatModel = Boolean(estandarLicenseMonthly && profesionalLicenseMonthly)

  const individualMonthly = process.env.PADDLE_PRICE_INDIVIDUAL_MONTHLY?.trim() ?? ""
  const teamBaseMonthly = process.env.PADDLE_PRICE_TEAM_BASE_MONTHLY?.trim() ?? ""
  const additionalSeatMonthly = process.env.PADDLE_PRICE_ADDITIONAL_SEAT_MONTHLY?.trim() ?? ""

  const legacyAll = [individualMonthly, teamBaseMonthly, additionalSeatMonthly]
  if (!tierPerSeatModel && legacyAll.some((s) => !s)) return null

  const byPriceId = new Map<string, PaddlePriceRole>()
  if (!tierPerSeatModel) {
    entry(byPriceId, individualMonthly, { productRole: "individual", interval: "monthly" })
    entry(byPriceId, teamBaseMonthly, { productRole: "team_base", interval: "monthly" })
    entry(byPriceId, additionalSeatMonthly, { productRole: "additional_seat", interval: "monthly" })
  } else {
    entry(byPriceId, estandarLicenseMonthly, { productRole: "estandar_license", interval: "monthly" })
    entry(byPriceId, profesionalLicenseMonthly, { productRole: "profesional_license", interval: "monthly" })
  }

  return {
    byPriceId,
    individualMonthly,
    teamBaseMonthly,
    additionalSeatMonthly,
    estandarLicenseMonthly,
    profesionalLicenseMonthly,
    tierPerSeatModel,
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
  individualMonthly?: string
  teamBaseMonthly?: string
  additionalSeatMonthly?: string
  estandarLicenseMonthly?: string
  profesionalLicenseMonthly?: string
  tierPerSeatModel?: boolean
}): PaddlePriceCatalog {
  const tierPerSeatModel = ids.tierPerSeatModel ?? false
  const byPriceId = new Map<string, PaddlePriceRole>()
  if (tierPerSeatModel) {
    const estandarLicenseMonthly = ids.estandarLicenseMonthly ?? "pri_tl_m"
    const profesionalLicenseMonthly = ids.profesionalLicenseMonthly ?? "pri_pl_m"
    entry(byPriceId, estandarLicenseMonthly, { productRole: "estandar_license", interval: "monthly" })
    entry(byPriceId, profesionalLicenseMonthly, { productRole: "profesional_license", interval: "monthly" })
    return {
      byPriceId,
      individualMonthly: "",
      teamBaseMonthly: "",
      additionalSeatMonthly: "",
      estandarLicenseMonthly,
      profesionalLicenseMonthly,
      tierPerSeatModel: true,
    }
  }

  const individualMonthly = ids.individualMonthly ?? "pri_ind_m"
  const teamBaseMonthly = ids.teamBaseMonthly ?? "pri_tb_m"
  const additionalSeatMonthly = ids.additionalSeatMonthly ?? "pri_ad_m"
  entry(byPriceId, individualMonthly, { productRole: "individual", interval: "monthly" })
  entry(byPriceId, teamBaseMonthly, { productRole: "team_base", interval: "monthly" })
  entry(byPriceId, additionalSeatMonthly, { productRole: "additional_seat", interval: "monthly" })
  return {
    byPriceId,
    individualMonthly,
    teamBaseMonthly,
    additionalSeatMonthly,
    estandarLicenseMonthly: "",
    profesionalLicenseMonthly: "",
    tierPerSeatModel: false,
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

  const hasInd = classified.some((c) => c.role.productRole === "individual")
  const hasBase = classified.some((c) => c.role.productRole === "team_base")
  const hasAddon = classified.some((c) => c.role.productRole === "additional_seat")
  const hasEstandarLicense = classified.some((c) => c.role.productRole === "estandar_license")
  const hasProfesionalLicense = classified.some((c) => c.role.productRole === "profesional_license")

  if (hasEstandarLicense || hasProfesionalLicense) {
    if (hasInd || hasBase || hasAddon || (hasEstandarLicense && hasProfesionalLicense)) {
      return {
        entitledSeats: null,
        planKind: null,
        billingIntervals: intervals,
        teamBaseQuantityObserved: null,
        issues: ["conflicting_tier_license_lines"],
        usedLegacyQuantitySum: false,
      }
    }
    const role = hasEstandarLicense ? "estandar_license" : "profesional_license"
    const rows = classified.filter((c) => c.role.productRole === role)
    if (rows.length !== 1) {
      return {
        entitledSeats: null,
        planKind: "team",
        billingIntervals: intervals,
        teamBaseQuantityObserved: null,
        issues: ["tier_license_multiple_lines"],
        usedLegacyQuantitySum: false,
      }
    }
    const qty = rows[0]!.qty
    if (qty < 1) {
      issues.push("tier_license_quantity_below_one")
    }
    return {
      entitledSeats: qty,
      planKind: "team",
      billingIntervals: intervals,
      teamBaseQuantityObserved: null,
      issues,
      usedLegacyQuantitySum: false,
    }
  }

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
