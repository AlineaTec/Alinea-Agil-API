import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import { createPaddlePriceCatalogForTests } from "../../commercial-pricing/paddle-price-catalog.js"
import { WorkspaceCommercialSubscriptionError } from "../domain/workspace-commercial-subscription.errors.js"
import type { WorkspaceBillingSnapshotProps } from "../domain/workspace-billing-snapshot.js"
import type { WorkspaceBillingStateService } from "./workspace-billing-state.service.js"
import type { WorkspaceLicenseService } from "../../workspace-licenses/services/workspace-license.service.js"
import type { WorkspaceMemberRepository } from "../../workspace-users/persistence/workspace-member.repository.js"
import {
  WorkspaceCommercialSubscriptionService,
  parseCommercialSubscriptionForOrchestration,
} from "./workspace-commercial-subscription.service.js"
import type { WorkspaceCommercialSubscriptionPorts } from "./workspace-commercial-subscription.service.js"

const WS = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee"

const catalog = createPaddlePriceCatalogForTests({
  individualMonthly: "pri_ind_m",
  individualAnnual: "pri_ind_a",
  teamBaseMonthly: "pri_team_m",
  teamBaseAnnual: "pri_team_a",
  additionalSeatMonthly: "pri_add_m",
  additionalSeatAnnual: "pri_add_a",
})

function baseSnapshot(over: Partial<WorkspaceBillingSnapshotProps> = {}): WorkspaceBillingSnapshotProps {
  const now = new Date()
  return {
    workspacePublicId: WS,
    billingSource: "paddle",
    subscriptionExternalId: "sub_test",
    planKey: "team",
    includedSeats: 3,
    additionalPaidSeats: 0,
    currentEntitledSeats: 3,
    scheduledEntitledSeats: null,
    scheduledSeatChangeEffectiveAt: null,
    paddleScheduledEntitledSeats: null,
    paddleScheduledSeatChangeEffectiveAt: null,
    billingStatus: "active",
    gracePeriodStartsAt: null,
    gracePeriodEndsAt: null,
    suspensionEffectiveAt: null,
    peakUsageInBillingPeriod: 0,
    maxConcurrentActiveUsers: 0,
    billingCycleAnchor: null,
    currentPeriodStartsAt: null,
    currentPeriodEndsAt: null,
    lastCommercialSyncAt: now,
    commercialExternalSnapshot: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

describe("parseCommercialSubscriptionForOrchestration", () => {
  it("Team 3 asientos: solo base qty 1, sin addon", () => {
    const parsed = parseCommercialSubscriptionForOrchestration(catalog, {
      items: [{ price_id: "pri_team_m", quantity: 1 }],
    })
    assert.equal(parsed.ok, true)
    if (parsed.ok) {
      assert.equal(parsed.planKind, "team")
      assert.equal(parsed.cadence, "monthly")
      assert.equal(parsed.teamBaseQty, 1)
      assert.equal(parsed.additionalSeatQty, 0)
    }
  })

  it("Team con addon: base 1 + additional 2", () => {
    const parsed = parseCommercialSubscriptionForOrchestration(catalog, {
      items: [
        { price_id: "pri_team_m", quantity: 1 },
        { price_id: "pri_add_m", quantity: 2 },
      ],
    })
    assert.equal(parsed.ok, true)
    if (parsed.ok) {
      assert.equal(parsed.additionalSeatQty, 2)
    }
  })

  it("Individual annual qty 1", () => {
    const parsed = parseCommercialSubscriptionForOrchestration(catalog, {
      items: [{ price_id: "pri_ind_a", quantity: 1 }],
    })
    assert.equal(parsed.ok, true)
    if (parsed.ok) {
      assert.equal(parsed.planKind, "individual")
      assert.equal(parsed.cadence, "annual")
    }
  })

  it("rechaza Team Base qty ≠ 1", () => {
    const parsed = parseCommercialSubscriptionForOrchestration(catalog, {
      items: [{ price_id: "pri_team_m", quantity: 2 }],
    })
    assert.equal(parsed.ok, false)
  })
})

describe("WorkspaceCommercialSubscriptionService (orquestación)", () => {
  const envKeys = [
    "PADDLE_PRICE_INDIVIDUAL_MONTHLY",
    "PADDLE_PRICE_INDIVIDUAL_ANNUAL",
    "PADDLE_PRICE_TEAM_BASE_MONTHLY",
    "PADDLE_PRICE_TEAM_BASE_ANNUAL",
    "PADDLE_PRICE_ADDITIONAL_SEAT_MONTHLY",
    "PADDLE_PRICE_ADDITIONAL_SEAT_ANNUAL",
    "PADDLE_API_KEY",
  ] as const

  beforeEach(() => {
    process.env.PADDLE_PRICE_INDIVIDUAL_MONTHLY = "pri_ind_m"
    process.env.PADDLE_PRICE_INDIVIDUAL_ANNUAL = "pri_ind_a"
    process.env.PADDLE_PRICE_TEAM_BASE_MONTHLY = "pri_team_m"
    process.env.PADDLE_PRICE_TEAM_BASE_ANNUAL = "pri_team_a"
    process.env.PADDLE_PRICE_ADDITIONAL_SEAT_MONTHLY = "pri_add_m"
    process.env.PADDLE_PRICE_ADDITIONAL_SEAT_ANNUAL = "pri_add_a"
    process.env.PADDLE_API_KEY = "sandbox_test_key"
  })

  afterEach(() => {
    for (const k of envKeys) delete process.env[k]
  })

  it("checkout Individual monthly arma transacción y URL", async () => {
    let posted: Record<string, unknown> | null = null
    const ports: WorkspaceCommercialSubscriptionPorts = {
      fetchSubscription: async () => ({ ok: false, httpStatus: 500, bodySnippet: "unused" }),
      createTransaction: async (_key, body) => {
        posted = body as Record<string, unknown>
        return {
          ok: true,
          data: {
            id: "txn_01",
            checkout: { url: "https://checkout.test/pay" },
          },
        }
      },
      patchSubscription: async () => ({ ok: false, httpStatus: 500, bodySnippet: "unused" }),
      previewSubscription: async () => ({ ok: false, httpStatus: 500, bodySnippet: "unused" }),
    }

    const billing: Pick<WorkspaceBillingStateService, "materializeWorkspaceBillingSnapshot" | "reconcileSnapshotFromLicense"> =
      {
        materializeWorkspaceBillingSnapshot: async () =>
          baseSnapshot({ subscriptionExternalId: null, billingStatus: "active" }),
        reconcileSnapshotFromLicense: async () => {},
      }

    const licenses: Pick<WorkspaceLicenseService, "getSummary" | "scheduleSeatReduction"> = {
      getSummary: async () => null,
      scheduleSeatReduction: async () => {
        throw new Error("unused")
      },
    }

    const members: Pick<WorkspaceMemberRepository, "countActiveSeatConsumingMembers"> = {
      countActiveSeatConsumingMembers: async () => 0,
    }

    const svc = new WorkspaceCommercialSubscriptionService(
      billing as WorkspaceBillingStateService,
      licenses as WorkspaceLicenseService,
      members as WorkspaceMemberRepository,
      ports,
    )

    const out = await svc.createCheckoutSession(WS, { plan: "individual", billingCadence: "monthly" })
    assert.equal(out.checkoutUrl, "https://checkout.test/pay")
    assert(posted)
    const items = posted!.items as Array<{ price_id: string; quantity: number }>
    assert.deepEqual(items, [{ price_id: "pri_ind_m", quantity: 1 }])
  })

  it("checkout Team 3 asientos: solo Team Base", async () => {
    let posted: Record<string, unknown> | null = null
    const ports: WorkspaceCommercialSubscriptionPorts = {
      fetchSubscription: async () => ({ ok: false, httpStatus: 500, bodySnippet: "unused" }),
      createTransaction: async (_key, body) => {
        posted = body as Record<string, unknown>
        return {
          ok: true,
          data: {
            id: "txn_02",
            checkout: { url: "https://checkout.test/pay2" },
          },
        }
      },
      patchSubscription: async () => ({ ok: false, httpStatus: 500, bodySnippet: "unused" }),
      previewSubscription: async () => ({ ok: false, httpStatus: 500, bodySnippet: "unused" }),
    }

    const billing: Pick<WorkspaceBillingStateService, "materializeWorkspaceBillingSnapshot"> = {
      materializeWorkspaceBillingSnapshot: async () =>
        baseSnapshot({ subscriptionExternalId: null }),
    }

    const svc = new WorkspaceCommercialSubscriptionService(
      billing as WorkspaceBillingStateService,
      {} as WorkspaceLicenseService,
      { countActiveSeatConsumingMembers: async () => 0 } as WorkspaceMemberRepository,
      ports,
    )

    await svc.createCheckoutSession(WS, { plan: "team", billingCadence: "monthly", desiredSeats: 3 })
    const items = (posted as NonNullable<typeof posted>).items as Array<{ price_id: string; quantity: number }>
    assert.deepEqual(items, [{ price_id: "pri_team_m", quantity: 1 }])
  })

  it("seat-increase sólo sube Additional Seat", async () => {
    let patchBody: Record<string, unknown> | null = null
    const ports: WorkspaceCommercialSubscriptionPorts = {
      fetchSubscription: async () => ({
        ok: true,
        data: {
          status: "active",
          items: [
            { price_id: "pri_team_m", quantity: 1 },
            { price_id: "pri_add_m", quantity: 1 },
          ],
        },
      }),
      createTransaction: async () => ({ ok: false, httpStatus: 500, bodySnippet: "unused" }),
      patchSubscription: async (_sub, _key, body) => {
        patchBody = body as Record<string, unknown>
        return { ok: true, data: { id: "sub_x" } }
      },
      previewSubscription: async () => ({ ok: false, httpStatus: 500, bodySnippet: "unused" }),
    }

    const billing: Pick<WorkspaceBillingStateService, "materializeWorkspaceBillingSnapshot"> = {
      materializeWorkspaceBillingSnapshot: async () => baseSnapshot(),
    }

    const svc = new WorkspaceCommercialSubscriptionService(
      billing as WorkspaceBillingStateService,
      {} as WorkspaceLicenseService,
      { countActiveSeatConsumingMembers: async () => 0 } as WorkspaceMemberRepository,
      ports,
    )

    await svc.increaseTeamSeats(WS, 5)
    const items = patchBody!.items as Array<{ price_id: string; quantity: number }>
    assert.deepEqual(items, [
      { price_id: "pri_team_m", quantity: 1 },
      { price_id: "pri_add_m", quantity: 2 },
    ])
    assert.equal(patchBody!.proration_billing_mode, "prorated_immediately")
  })

  it("seat-reduction-schedule usa full_next_billing_period y agenda licencia", async () => {
    let patchBody: Record<string, unknown> | null = null
    let scheduledTarget: number | null = null

    const ports: WorkspaceCommercialSubscriptionPorts = {
      fetchSubscription: async () => ({
        ok: true,
        data: {
          status: "active",
          items: [
            { price_id: "pri_team_m", quantity: 1 },
            { price_id: "pri_add_m", quantity: 2 },
          ],
        },
      }),
      createTransaction: async () => ({ ok: false, httpStatus: 500, bodySnippet: "unused" }),
      patchSubscription: async (_sub, _key, body) => {
        patchBody = body as Record<string, unknown>
        return { ok: true, data: {} }
      },
      previewSubscription: async () => ({ ok: false, httpStatus: 500, bodySnippet: "unused" }),
    }

    const billing: Pick<
      WorkspaceBillingStateService,
      "materializeWorkspaceBillingSnapshot" | "reconcileSnapshotFromLicense"
    > = {
      materializeWorkspaceBillingSnapshot: async () =>
        baseSnapshot({ currentEntitledSeats: 5, additionalPaidSeats: 2 }),
      reconcileSnapshotFromLicense: async () => {},
    }

    const licenses: Pick<WorkspaceLicenseService, "scheduleSeatReduction" | "getSummary"> = {
      getSummary: async () => null,
      scheduleSeatReduction: async (wid, target) => {
        scheduledTarget = target
        assert.equal(wid, WS)
        return {} as Awaited<ReturnType<WorkspaceLicenseService["scheduleSeatReduction"]>>
      },
    }

    const svc = new WorkspaceCommercialSubscriptionService(
      billing as WorkspaceBillingStateService,
      licenses as WorkspaceLicenseService,
      { countActiveSeatConsumingMembers: async () => 2 } as WorkspaceMemberRepository,
      ports,
    )

    await svc.scheduleTeamSeatReduction(WS, 4)
    assert.equal(scheduledTarget, 4)
    assert.equal(patchBody!.proration_billing_mode, "full_next_billing_period")
    const items = patchBody!.items as Array<{ price_id: string; quantity: number }>
    assert.deepEqual(items, [
      { price_id: "pri_team_m", quantity: 1 },
      { price_id: "pri_add_m", quantity: 1 },
    ])
  })

  it("upgrade Individual → Team reemplaza ítems conservando cadencia", async () => {
    let patchBody: Record<string, unknown> | null = null
    const ports: WorkspaceCommercialSubscriptionPorts = {
      fetchSubscription: async () => ({
        ok: true,
        data: {
          status: "active",
          items: [{ price_id: "pri_ind_m", quantity: 1 }],
        },
      }),
      createTransaction: async () => ({ ok: false, httpStatus: 500, bodySnippet: "unused" }),
      patchSubscription: async (_sub, _key, body) => {
        patchBody = body as Record<string, unknown>
        return { ok: true, data: {} }
      },
      previewSubscription: async () => ({ ok: false, httpStatus: 500, bodySnippet: "unused" }),
    }

    const billing: Pick<WorkspaceBillingStateService, "materializeWorkspaceBillingSnapshot"> = {
      materializeWorkspaceBillingSnapshot: async () => baseSnapshot({ planKey: "individual" }),
    }

    const svc = new WorkspaceCommercialSubscriptionService(
      billing as WorkspaceBillingStateService,
      {} as WorkspaceLicenseService,
      { countActiveSeatConsumingMembers: async () => 0 } as WorkspaceMemberRepository,
      ports,
    )

    await svc.upgradeIndividualToTeam(WS, 5)
    const items = patchBody!.items as Array<{ price_id: string; quantity: number }>
    assert.deepEqual(items, [
      { price_id: "pri_team_m", quantity: 1 },
      { price_id: "pri_add_m", quantity: 2 },
    ])
  })

  it("rechaza checkout si ya hay suscripción vinculada activa", async () => {
    const ports: WorkspaceCommercialSubscriptionPorts = {
      fetchSubscription: async () => ({ ok: false, httpStatus: 500, bodySnippet: "unused" }),
      createTransaction: async () => ({ ok: false, httpStatus: 500, bodySnippet: "unused" }),
      patchSubscription: async () => ({ ok: false, httpStatus: 500, bodySnippet: "unused" }),
      previewSubscription: async () => ({ ok: false, httpStatus: 500, bodySnippet: "unused" }),
    }

    const billing: Pick<WorkspaceBillingStateService, "materializeWorkspaceBillingSnapshot"> = {
      materializeWorkspaceBillingSnapshot: async () => baseSnapshot({ subscriptionExternalId: "sub_abc" }),
    }

    const svc = new WorkspaceCommercialSubscriptionService(
      billing as WorkspaceBillingStateService,
      {} as WorkspaceLicenseService,
      { countActiveSeatConsumingMembers: async () => 0 } as WorkspaceMemberRepository,
      ports,
    )

    await assert.rejects(
      () => svc.createCheckoutSession(WS, { plan: "individual", billingCadence: "monthly" }),
      (e: unknown) =>
        e instanceof WorkspaceCommercialSubscriptionError &&
        e.code === "workspace_billing_subscription_already_linked",
    )
  })

  it("rechaza seat-increase si falta subscriptionExternalId", async () => {
    const ports: WorkspaceCommercialSubscriptionPorts = {
      fetchSubscription: async () => ({ ok: false, httpStatus: 500, bodySnippet: "unused" }),
      createTransaction: async () => ({ ok: false, httpStatus: 500, bodySnippet: "unused" }),
      patchSubscription: async () => ({ ok: false, httpStatus: 500, bodySnippet: "unused" }),
      previewSubscription: async () => ({ ok: false, httpStatus: 500, bodySnippet: "unused" }),
    }

    const billing: Pick<WorkspaceBillingStateService, "materializeWorkspaceBillingSnapshot"> = {
      materializeWorkspaceBillingSnapshot: async () => baseSnapshot({ subscriptionExternalId: null }),
    }

    const svc = new WorkspaceCommercialSubscriptionService(
      billing as WorkspaceBillingStateService,
      {} as WorkspaceLicenseService,
      { countActiveSeatConsumingMembers: async () => 0 } as WorkspaceMemberRepository,
      ports,
    )

    await assert.rejects(
      () => svc.increaseTeamSeats(WS, 5),
      (e: unknown) =>
        e instanceof WorkspaceCommercialSubscriptionError &&
        e.code === "workspace_billing_missing_paddle_subscription",
    )
  })
})
