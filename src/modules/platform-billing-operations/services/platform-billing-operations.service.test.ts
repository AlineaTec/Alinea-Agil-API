import assert from "node:assert/strict"
import { test } from "node:test"

import type { BillingNotificationKind } from "../../billing-seat-enforcement/domain/billing-notification-kind.js"
import type { WorkspaceBillingSnapshotProps } from "../../billing-seat-enforcement/domain/workspace-billing-snapshot.js"
import type { BillingNotificationSentRepository } from "../../billing-seat-enforcement/persistence/billing-notification-sent.repository.js"
import type { WorkspaceBillingAuditRepository } from "../../billing-seat-enforcement/persistence/workspace-billing-audit.repository.js"
import type {
  WorkspaceBillingSnapshotPlatformFilter,
  WorkspaceBillingSnapshotRepository,
} from "../../billing-seat-enforcement/persistence/workspace-billing-snapshot.repository.js"
import type { PaddleCommercialReconcileService } from "../../billing-seat-enforcement/services/paddle-commercial-reconcile.service.js"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import type { WorkspaceCatalogRepository, WorkspaceCatalogRow } from "../../platform-tenants/persistence/workspace-catalog.repository.js"
import type { WorkspaceMemberRepository } from "../../workspace-users/persistence/workspace-member.repository.js"
import { PlatformTenantForbiddenError } from "../../platform-tenants/domain/platform-tenant.errors.js"

import { PlatformBillingOperationsNotFoundError, PlatformBillingOperationsService } from "./platform-billing-operations.service.js"

const WS = "cccccccc-cccc-4ccc-dddd-eeeeeeeeeeee"

function baseSnap(over: Partial<WorkspaceBillingSnapshotProps> = {}): WorkspaceBillingSnapshotProps {
  const now = new Date("2026-04-01T12:00:00.000Z")
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
    billingCycleAnchor: now,
    currentPeriodStartsAt: now,
    currentPeriodEndsAt: now,
    lastCommercialSyncAt: now,
    commercialExternalSnapshot: JSON.stringify({ kind: "test_footprint", materializedAt: now.toISOString() }),
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

function sess(role: PlatformSessionContext["role"]): PlatformSessionContext {
  return {
    platformUserId: "p1",
    email: "ops@test.local",
    role,
  }
}

class SnapFake implements WorkspaceBillingSnapshotRepository {
  constructor(public row: WorkspaceBillingSnapshotProps | null) {}

  async findByWorkspacePublicId(id: string) {
    return id === WS ? this.row : null
  }

  async findBySubscriptionExternalId(): Promise<WorkspaceBillingSnapshotProps | null> {
    return null
  }

  async replace(): Promise<void> {}

  async insertInitial(): Promise<void> {}

  async findPaddleLinkedWorkspacePublicIds(): Promise<string[]> {
    return []
  }

  async findGraceSnapshotsEndingWithin(): Promise<WorkspaceBillingSnapshotProps[]> {
    return []
  }

  async findSnapshotsWithGraceExpiredBefore(): Promise<WorkspaceBillingSnapshotProps[]> {
    return []
  }

  async countForPlatformFilter(_filter: WorkspaceBillingSnapshotPlatformFilter): Promise<number> {
    return this.row ? 1 : 0
  }

  async findForPlatformFilter(
    _filter: WorkspaceBillingSnapshotPlatformFilter,
    _opts: { skip: number; limit: number },
  ): Promise<WorkspaceBillingSnapshotProps[]> {
    return this.row ? [this.row] : []
  }
}

class AuditFake implements WorkspaceBillingAuditRepository {
  async append(): Promise<void> {}

  async listRecentByWorkspacePublicId(): Promise<
    Array<{ eventType: string; payload: Record<string, unknown>; createdAt: Date }>
  > {
    return [{ eventType: "grace_started", payload: {}, createdAt: new Date() }]
  }

  async findLatestAttentionEventsByWorkspaceIds(): Promise<Map<string, { eventType: string; createdAt: Date }>> {
    return new Map()
  }
}

class NotifyFake implements BillingNotificationSentRepository {
  async tryClaim(): Promise<boolean> {
    return true
  }

  async listRecentByWorkspacePublicId(): Promise<
    Array<{ kind: BillingNotificationKind; dedupeKey: string; sentAt: Date }>
  > {
    return [{ kind: "billing_grace_started", dedupeKey: "x", sentAt: new Date() }]
  }

  async findLatestPerWorkspaceIds(): Promise<
    Map<string, { kind: BillingNotificationKind; dedupeKey: string; sentAt: Date }>
  > {
    const m = new Map<string, { kind: BillingNotificationKind; dedupeKey: string; sentAt: Date }>()
    m.set(WS, { kind: "billing_grace_started", dedupeKey: "grace_end:x", sentAt: new Date() })
    return m
  }
}

class MembersFake implements WorkspaceMemberRepository {
  constructor(private readonly n: number) {}

  async countActiveSeatConsumingMembers(): Promise<number> {
    return this.n
  }
}

class CatalogFake implements WorkspaceCatalogRepository {
  async listAll(): Promise<WorkspaceCatalogRow[]> {
    return []
  }

  async findByPublicId(id: string): Promise<WorkspaceCatalogRow | null> {
    return id === WS
      ? {
          workspacePublicId: WS,
          code: "demo",
          displayName: "Demo Workspace",
          modality: "team",
          billingCadence: "monthly",
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      : null
  }
}

function reconcileStub(): PaddleCommercialReconcileService {
  return {
    async reconcileWorkspace() {
      return { status: "skipped", reason: "manual_billing" }
    },
  } as unknown as PaddleCommercialReconcileService
}

function buildSvc(row: WorkspaceBillingSnapshotProps | null, members = 2) {
  return new PlatformBillingOperationsService(
    new SnapFake(row),
    new AuditFake(),
    new NotifyFake(),
    new MembersFake(members),
    new CatalogFake(),
    reconcileStub(),
    null,
  )
}

test("detalle 404 sin snapshot", async () => {
  await assert.rejects(() => buildSvc(null).getWorkspaceDetail(sess("platform_operator"), WS), PlatformBillingOperationsNotFoundError)
})

test("listado devuelve fila con última notificación", async () => {
  const out = await buildSvc(baseSnap()).listWorkspaces(sess("platform_auditor"), {
    statusGroup: "active",
    billingSource: "all",
    limit: 25,
    offset: 0,
  })
  assert.equal(out.total, 1)
  assert.equal(out.items[0]?.workspacePublicId, WS)
  assert.ok(out.items[0]?.lastNotification?.kind)
})

test("auditor no puede disparar reconciliación", () => {
  assert.throws(() => buildSvc(baseSnap()).assertCanTriggerReconcile(sess("platform_auditor")), PlatformTenantForbiddenError)
})

test("operator puede disparar reconciliación (stub)", async () => {
  const r = await buildSvc(baseSnap()).reconcileWorkspaceNow(sess("platform_operator"), WS)
  assert.equal(r.status, "skipped")
})
