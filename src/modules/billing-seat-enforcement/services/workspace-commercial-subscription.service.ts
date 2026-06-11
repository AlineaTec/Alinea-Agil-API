import type { BillingCadence, CommercialPlanKind } from "../../commercial-pricing/commercial-pricing.constants.js"
import { effectiveTeamSeatsPurchased } from "../../commercial-pricing/compute-commercial-quote.js"
import { buildPaddleSubscriptionCheckoutLines } from "../../commercial-pricing/paddle-checkout-lines.js"
import {
  deriveCommercialSeatEntitlementFromPaddleItems,
  extractPaddleItemsArrayFromPayload,
  extractPriceIdFromPaddleItemLike,
  extractQuantityFromPaddleItemLike,
  loadPaddlePriceCatalogFromEnv,
  resolvePriceRoleInCatalog,
  type PaddlePriceCatalog,
} from "../../commercial-pricing/paddle-price-catalog.js"
import {
  createPaddleTransaction,
  extractTransactionCheckoutUrl,
  extractTransactionId,
  patchPaddleSubscription,
  previewPaddleSubscriptionPatch,
  type PaddleRestFailure,
} from "../../../integrations/paddle/paddle-billing-rest.js"
import { fetchPaddleSubscriptionData } from "../../../integrations/paddle/fetch-paddle-subscription.js"
import { SeatReductionScheduleError } from "../../workspace-licenses/domain/seat-capacity.policy.js"
import type { WorkspaceLicenseService } from "../../workspace-licenses/services/workspace-license.service.js"
import type { WorkspaceMemberRepository } from "../../workspace-users/persistence/workspace-member.repository.js"
import { WorkspaceCommercialSubscriptionError } from "../domain/workspace-commercial-subscription.errors.js"
import type { WorkspaceBillingSnapshotProps } from "../domain/workspace-billing-snapshot.js"
import type { WorkspaceBillingStateService } from "./workspace-billing-state.service.js"

export type WorkspaceCommercialSubscriptionPorts = {
  fetchSubscription: typeof fetchPaddleSubscriptionData
  createTransaction: typeof createPaddleTransaction
  patchSubscription: typeof patchPaddleSubscription
  previewSubscription: typeof previewPaddleSubscriptionPatch
}

const defaultPorts: WorkspaceCommercialSubscriptionPorts = {
  fetchSubscription: fetchPaddleSubscriptionData,
  createTransaction: createPaddleTransaction,
  patchSubscription: patchPaddleSubscription,
  previewSubscription: previewPaddleSubscriptionPatch,
}

type ParsedCommercialSubscription =
  | {
      ok: true
      cadence: BillingCadence
      planKind: CommercialPlanKind
      teamBaseQty: number
      additionalSeatQty: number
      derivationIssues: string[]
    }
  | { ok: false; reason: string }

function requireCatalog(): PaddlePriceCatalog {
  const catalog = loadPaddlePriceCatalogFromEnv()
  if (!catalog) {
    throw new WorkspaceCommercialSubscriptionError(
      "commercial_catalog_not_configured",
      "Faltan variables PADDLE_PRICE_* (catálogo comercial mensual incompleto).",
      503,
    )
  }
  return catalog
}

function requireApiKey(): string {
  const key = process.env.PADDLE_API_KEY?.trim()
  if (!key) {
    throw new WorkspaceCommercialSubscriptionError(
      "commercial_paddle_integration_unavailable",
      "PADDLE_API_KEY no está configurada en el servidor.",
      503,
    )
  }
  return key
}

function paddleRemoteFailure(err: PaddleRestFailure): never {
  throw new WorkspaceCommercialSubscriptionError(
    "paddle_remote_error",
    `Paddle respondió con error (${err.httpStatus}).`,
    502,
    { paddleHttpStatus: err.httpStatus, snippet: err.bodySnippet },
  )
}

function assertPaddleBillingSnapshot(row: WorkspaceBillingSnapshotProps): void {
  if (row.billingSource === "manual") {
    throw new WorkspaceCommercialSubscriptionError(
      "workspace_billing_not_paddle",
      "Este workspace tiene facturación manual; la compra o cambios Paddle no aplican.",
    )
  }
}

function requireSubscriptionExternalId(row: WorkspaceBillingSnapshotProps): string {
  const id = row.subscriptionExternalId?.trim()
  if (!id) {
    throw new WorkspaceCommercialSubscriptionError(
      "workspace_billing_missing_paddle_subscription",
      "No hay subscriptionExternalId vinculado; usa checkout para una suscripción nueva o espera la sincronización.",
    )
  }
  return id
}

function subscriptionStatus(data: Record<string, unknown>): string {
  return typeof data.status === "string" ? data.status : ""
}

function assertSubscriptionCommerciallyModifiable(data: Record<string, unknown>): void {
  const s = subscriptionStatus(data)
  if (s === "past_due") {
    throw new WorkspaceCommercialSubscriptionError(
      "commercial_subscription_not_modifiable",
      "La suscripción está past_due; regulariza el pago antes de cambiar el plan o asientos.",
      409,
    )
  }
  if (s === "canceled" || s === "cancelled") {
    throw new WorkspaceCommercialSubscriptionError(
      "commercial_subscription_not_modifiable",
      "La suscripción está cancelada; no se puede modificar desde la API.",
      409,
    )
  }
  if (s === "paused") {
    throw new WorkspaceCommercialSubscriptionError(
      "commercial_subscription_not_modifiable",
      "La suscripción está pausada (v1 no mapeado); no se puede modificar desde la API.",
      409,
    )
  }
}

export function parseCommercialSubscriptionForOrchestration(
  catalog: PaddlePriceCatalog,
  subscriptionData: Record<string, unknown>,
): ParsedCommercialSubscription {
  const items = extractPaddleItemsArrayFromPayload(subscriptionData)
  if (items.length < 1) {
    return { ok: false, reason: "no_items" }
  }

  const derived = deriveCommercialSeatEntitlementFromPaddleItems(items, catalog)

  let cadence: BillingCadence | null = null
  let teamBaseQty = 0
  let additionalSeatQty = 0
  const roles: CommercialPlanKind[] = []

  for (const it of items) {
    const priceId = extractPriceIdFromPaddleItemLike(it)
    const qty = extractQuantityFromPaddleItemLike(it)
    if (!priceId) return { ok: false, reason: "missing_price_id" }
    const role = resolvePriceRoleInCatalog(catalog, priceId)
    if (!role) return { ok: false, reason: `unknown_price:${priceId}` }
    cadence ??= role.interval
    if (role.interval !== cadence) return { ok: false, reason: "mixed_interval" }

    if (role.productRole === "individual") roles.push("individual")
    if (role.productRole === "team_base") {
      roles.push("team")
      teamBaseQty += qty
    }
    if (role.productRole === "additional_seat") {
      roles.push("team")
      additionalSeatQty += qty
    }
  }

  const uniq = [...new Set(roles)]
  if (uniq.length > 1 || (uniq.includes("individual") && uniq.includes("team"))) {
    return { ok: false, reason: "conflicting_roles" }
  }

  const planKind: CommercialPlanKind = uniq[0] === "individual" ? "individual" : "team"
  if (!cadence) return { ok: false, reason: "no_cadence" }

  if (planKind === "individual") {
    if (items.length !== 1 || teamBaseQty > 0 || additionalSeatQty > 0) {
      return { ok: false, reason: "individual_shape" }
    }
    return {
      ok: true,
      cadence,
      planKind: "individual",
      teamBaseQty: 0,
      additionalSeatQty: 0,
      derivationIssues: [...derived.issues],
    }
  }

  if (teamBaseQty !== 1) {
    return { ok: false, reason: "team_base_quantity_not_one" }
  }

  return {
    ok: true,
    cadence,
    planKind: "team",
    teamBaseQty,
    additionalSeatQty,
    derivationIssues: [...derived.issues],
  }
}

function teamPatchItems(catalog: PaddlePriceCatalog, _cadence: BillingCadence, additionalSeatQty: number): Array<{
  price_id: string
  quantity: number
}> {
  const baseId = catalog.teamBaseMonthly
  const addId = catalog.additionalSeatMonthly
  if (!baseId.trim() || (!addId.trim() && additionalSeatQty > 0)) {
    throw new WorkspaceCommercialSubscriptionError(
      "commercial_catalog_not_configured",
      "Catálogo Paddle incompleto para Team en esta cadencia.",
      503,
    )
  }
  const items: Array<{ price_id: string; quantity: number }> = [{ price_id: baseId, quantity: 1 }]
  if (additionalSeatQty > 0) {
    items.push({ price_id: addId, quantity: additionalSeatQty })
  }
  return items
}

export type CheckoutSessionResult = {
  checkoutUrl: string
  transactionId: string | null
}

export class WorkspaceCommercialSubscriptionService {
  constructor(
    private readonly billing: WorkspaceBillingStateService,
    private readonly workspaceLicenses: WorkspaceLicenseService,
    private readonly members: WorkspaceMemberRepository,
    private readonly ports: WorkspaceCommercialSubscriptionPorts = defaultPorts,
  ) {}

  async createCheckoutSession(
    workspacePublicId: string,
    input: {
      plan: CommercialPlanKind
      billingCadence: BillingCadence
      desiredSeats?: number
    },
  ): Promise<CheckoutSessionResult> {
    const catalog = requireCatalog()
    const apiKey = requireApiKey()
    const snap = await this.billing.materializeWorkspaceBillingSnapshot(workspacePublicId)
    assertPaddleBillingSnapshot(snap)

    const linked = snap.subscriptionExternalId?.trim()
    if (
      linked &&
      snap.billingStatus !== "cancelled" &&
      snap.billingStatus !== "expired"
    ) {
      throw new WorkspaceCommercialSubscriptionError(
        "workspace_billing_subscription_already_linked",
        "Este workspace ya tiene una suscripción Paddle vinculada; usa los endpoints de cambio de plan o asientos.",
        409,
      )
    }

    if (input.plan === "individual") {
      if (input.desiredSeats != null && input.desiredSeats !== 1) {
        throw new WorkspaceCommercialSubscriptionError(
          "individual_rejects_addon",
          "Individual no admite asientos adicionales en v1.",
        )
      }
    }

    const built = buildPaddleSubscriptionCheckoutLines({
      plan: input.plan,
      billingCadence: input.billingCadence,
      teamSeatsRequested: input.desiredSeats,
      catalog,
    })
    if (!built.ok) {
      if (built.reason === "individual_rejects_addon") {
        throw new WorkspaceCommercialSubscriptionError(
          "individual_rejects_addon",
          "Individual no admite addons en el checkout.",
        )
      }
      throw new WorkspaceCommercialSubscriptionError(
        "commercial_catalog_not_configured",
        "No se pudieron resolver price_id para este checkout.",
        503,
      )
    }

    const items = built.lines.map((l) => ({ price_id: l.priceId, quantity: l.quantity }))
    const tx = await this.ports.createTransaction(apiKey, {
      items,
      collection_mode: "automatic",
      custom_data: { workspace_public_id: workspacePublicId },
    })
    if (!tx.ok) paddleRemoteFailure(tx)

    const checkoutUrl = extractTransactionCheckoutUrl(tx.data)
    if (!checkoutUrl) {
      throw new WorkspaceCommercialSubscriptionError(
        "paddle_checkout_url_missing",
        "Paddle creó la transacción pero no devolvió checkout.url (¿incluir customer/address o revisar modo draft?).",
        502,
      )
    }

    return { checkoutUrl, transactionId: extractTransactionId(tx.data) }
  }

  async increaseTeamSeats(workspacePublicId: string, desiredSeats: number): Promise<{
    subscriptionId: string
    noop: boolean
  }> {
    const catalog = requireCatalog()
    const apiKey = requireApiKey()
    const snap = await this.billing.materializeWorkspaceBillingSnapshot(workspacePublicId)
    assertPaddleBillingSnapshot(snap)
    const subId = requireSubscriptionExternalId(snap)

    const targetPurchased = effectiveTeamSeatsPurchased(desiredSeats)
    const additionalTarget = Math.max(0, targetPurchased - 3)

    const fetched = await this.ports.fetchSubscription(subId, apiKey)
    if (!fetched.ok) paddleRemoteFailure(fetched)
    assertSubscriptionCommerciallyModifiable(fetched.data)

    const parsed = parseCommercialSubscriptionForOrchestration(catalog, fetched.data)
    if (!parsed.ok) {
      throw new WorkspaceCommercialSubscriptionError(
        "commercial_subscription_items_ambiguous",
        `No se pudo interpretar la suscripción Paddle (${parsed.reason}).`,
        409,
      )
    }
    if (parsed.planKind !== "team") {
      throw new WorkspaceCommercialSubscriptionError(
        "commercial_transition_not_supported",
        "Solo suscripciones Team pueden ampliar asientos con este endpoint.",
      )
    }
    if (parsed.derivationIssues.length > 0) {
      throw new WorkspaceCommercialSubscriptionError(
        "commercial_subscription_items_ambiguous",
        `Ítems con avisos: ${parsed.derivationIssues.join(", ")}`,
        409,
      )
    }

    if (additionalTarget < parsed.additionalSeatQty) {
      throw new WorkspaceCommercialSubscriptionError(
        "commercial_seat_target_not_an_increase",
        "El objetivo es menor que los Additional Seat actuales; usa el endpoint de reducción programada.",
      )
    }
    if (additionalTarget === parsed.additionalSeatQty) {
      return { subscriptionId: subId, noop: true }
    }

    const items = teamPatchItems(catalog, parsed.cadence, additionalTarget)
    const patched = await this.ports.patchSubscription(subId, apiKey, {
      items,
      proration_billing_mode: "prorated_immediately",
    })
    if (!patched.ok) paddleRemoteFailure(patched)

    return { subscriptionId: subId, noop: false }
  }

  async scheduleTeamSeatReduction(
    workspacePublicId: string,
    desiredSeats: number,
    audit?: { actorUserPublicId: string },
  ): Promise<{ subscriptionId: string }> {
    const catalog = requireCatalog()
    const apiKey = requireApiKey()
    const snap = await this.billing.materializeWorkspaceBillingSnapshot(workspacePublicId)
    assertPaddleBillingSnapshot(snap)
    const subId = requireSubscriptionExternalId(snap)

    const targetPurchased = effectiveTeamSeatsPurchased(desiredSeats)
    const additionalTarget = Math.max(0, targetPurchased - 3)

    const activeUsers = await this.members.countActiveSeatConsumingMembers(workspacePublicId)
    if (targetPurchased < activeUsers) {
      throw new WorkspaceCommercialSubscriptionError(
        "commercial_active_users_exceed_target",
        `Hay ${activeUsers} usuarios activos con asiento; el mínimo viable es ${activeUsers}.`,
        400,
        { activeUsers, targetPurchased },
      )
    }

    try {
      await this.workspaceLicenses.scheduleSeatReduction(workspacePublicId, targetPurchased, audit)
    } catch (e) {
      if (e instanceof SeatReductionScheduleError) {
        throw new WorkspaceCommercialSubscriptionError(
          "commercial_seat_reduction_invalid",
          e.message,
          400,
        )
      }
      throw e
    }

    await this.billing.reconcileSnapshotFromLicense(workspacePublicId, new Date())

    const fetched = await this.ports.fetchSubscription(subId, apiKey)
    if (!fetched.ok) paddleRemoteFailure(fetched)
    assertSubscriptionCommerciallyModifiable(fetched.data)

    const parsed = parseCommercialSubscriptionForOrchestration(catalog, fetched.data)
    if (!parsed.ok || parsed.planKind !== "team") {
      throw new WorkspaceCommercialSubscriptionError(
        "commercial_subscription_items_ambiguous",
        "Se esperaba una suscripción Team coherente con el catálogo.",
        409,
      )
    }
    if (parsed.derivationIssues.length > 0) {
      throw new WorkspaceCommercialSubscriptionError(
        "commercial_subscription_items_ambiguous",
        `Ítems con avisos: ${parsed.derivationIssues.join(", ")}`,
        409,
      )
    }

    if (additionalTarget >= parsed.additionalSeatQty) {
      throw new WorkspaceCommercialSubscriptionError(
        "commercial_seat_target_not_a_reduction",
        "El número de asientos objetivo no implica bajar Additional Seat respecto al actual.",
      )
    }

    const items = teamPatchItems(catalog, parsed.cadence, additionalTarget)
    const patched = await this.ports.patchSubscription(subId, apiKey, {
      items,
      proration_billing_mode: "full_next_billing_period",
    })
    if (!patched.ok) {
      throw new WorkspaceCommercialSubscriptionError(
        "paddle_subscription_update_failed_after_internal_schedule",
        "La reducción quedó programada en licencia interna, pero Paddle rechazó el ajuste de ítems; revisar suscripción en Paddle.",
        502,
        { paddleHttpStatus: patched.httpStatus, snippet: patched.bodySnippet },
      )
    }

    return { subscriptionId: subId }
  }

  async upgradeIndividualToTeam(workspacePublicId: string, desiredSeats: number): Promise<{
    subscriptionId: string
  }> {
    const catalog = requireCatalog()
    const apiKey = requireApiKey()
    const snap = await this.billing.materializeWorkspaceBillingSnapshot(workspacePublicId)
    assertPaddleBillingSnapshot(snap)
    const subId = requireSubscriptionExternalId(snap)

    const fetched = await this.ports.fetchSubscription(subId, apiKey)
    if (!fetched.ok) paddleRemoteFailure(fetched)
    assertSubscriptionCommerciallyModifiable(fetched.data)

    const parsed = parseCommercialSubscriptionForOrchestration(catalog, fetched.data)
    if (!parsed.ok) {
      throw new WorkspaceCommercialSubscriptionError(
        "commercial_subscription_items_ambiguous",
        `No se pudo interpretar la suscripción Paddle (${parsed.reason}).`,
        409,
      )
    }
    if (parsed.planKind !== "individual") {
      throw new WorkspaceCommercialSubscriptionError(
        "commercial_transition_not_supported",
        "La suscripción no es Individual; no aplica upgrade Individual → Team vía este endpoint.",
      )
    }
    if (parsed.derivationIssues.length > 0) {
      throw new WorkspaceCommercialSubscriptionError(
        "commercial_subscription_items_ambiguous",
        `Ítems con avisos: ${parsed.derivationIssues.join(", ")}`,
        409,
      )
    }

    const targetPurchased = effectiveTeamSeatsPurchased(desiredSeats)
    const built = buildPaddleSubscriptionCheckoutLines({
      plan: "team",
      billingCadence: parsed.cadence,
      teamSeatsRequested: targetPurchased,
      catalog,
    })
    if (!built.ok) {
      throw new WorkspaceCommercialSubscriptionError(
        "commercial_catalog_not_configured",
        "No se pudieron construir ítems Team para el upgrade.",
        503,
      )
    }

    const items = built.lines.map((l) => ({ price_id: l.priceId, quantity: l.quantity }))
    const patched = await this.ports.patchSubscription(subId, apiKey, {
      items,
      proration_billing_mode: "prorated_immediately",
    })
    if (!patched.ok) paddleRemoteFailure(patched)

    return { subscriptionId: subId }
  }

  /**
   * Opcional: mismo cuerpo que el PATCH real; útil para UI que quiera mostrar cargos antes de confirmar.
   */
  async previewTeamSeatIncrease(workspacePublicId: string, desiredSeats: number): Promise<Record<string, unknown>> {
    const catalog = requireCatalog()
    const apiKey = requireApiKey()
    const snap = await this.billing.materializeWorkspaceBillingSnapshot(workspacePublicId)
    assertPaddleBillingSnapshot(snap)
    const subId = requireSubscriptionExternalId(snap)

    const targetPurchased = effectiveTeamSeatsPurchased(desiredSeats)
    const additionalTarget = Math.max(0, targetPurchased - 3)

    const fetched = await this.ports.fetchSubscription(subId, apiKey)
    if (!fetched.ok) paddleRemoteFailure(fetched)
    assertSubscriptionCommerciallyModifiable(fetched.data)

    const parsed = parseCommercialSubscriptionForOrchestration(catalog, fetched.data)
    if (!parsed.ok || parsed.planKind !== "team") {
      throw new WorkspaceCommercialSubscriptionError(
        "commercial_subscription_items_ambiguous",
        "Preview solo soportado para Team con ítems claros.",
        409,
      )
    }

    const items = teamPatchItems(catalog, parsed.cadence, additionalTarget)
    const prev = await this.ports.previewSubscription(subId, apiKey, {
      items,
      proration_billing_mode: "prorated_immediately",
    })
    if (!prev.ok) paddleRemoteFailure(prev)
    return prev.data
  }
}

export function createWorkspaceCommercialSubscriptionService(options: {
  workspaceBillingStateService: WorkspaceBillingStateService
  workspaceLicenseService: WorkspaceLicenseService
  workspaceMemberRepository: WorkspaceMemberRepository
  ports?: WorkspaceCommercialSubscriptionPorts
}): WorkspaceCommercialSubscriptionService {
  return new WorkspaceCommercialSubscriptionService(
    options.workspaceBillingStateService,
    options.workspaceLicenseService,
    options.workspaceMemberRepository,
    options.ports ?? defaultPorts,
  )
}
