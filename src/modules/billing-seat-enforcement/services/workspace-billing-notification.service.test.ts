import assert from "node:assert/strict"
import { test } from "node:test"

import type { BillingNotificationKind } from "../domain/billing-notification-kind.js"
import type { WorkspaceBillingSnapshotProps } from "../domain/workspace-billing-snapshot.js"
import type { BillingNotificationSentRepository } from "../persistence/billing-notification-sent.repository.js"
import type { WorkspaceBillingSnapshotRepository } from "../persistence/workspace-billing-snapshot.repository.js"
import type { WorkspaceIdentityRepository } from "../../workspace-users/persistence/workspace-identity.repository.js"
import type { WorkspaceMemberRepository } from "../../workspace-users/persistence/workspace-member.repository.js"
import type { TransactionalEmailService } from "../../transactional-email/services/transactional-email.service.js"
import type { RenderedTransactionalEmail } from "../../transactional-email/templates/rendered-email.js"
import { WorkspaceBillingNotificationService } from "./workspace-billing-notification.service.js"

const WS = "bbbbbbbb-bbbb-4ccc-dddd-eeeeeeeeeeee"

function minimalSnapshot(over: Partial<WorkspaceBillingSnapshotProps>): WorkspaceBillingSnapshotProps {
  const now = new Date()
  return {
    workspacePublicId: WS,
    billingSource: "paddle",
    subscriptionExternalId: "sub_1",
    planKey: "team",
    includedSeats: 3,
    additionalPaidSeats: 0,
    currentEntitledSeats: 3,
    scheduledEntitledSeats: null,
    scheduledSeatChangeEffectiveAt: null,
    paddleScheduledEntitledSeats: null,
    paddleScheduledSeatChangeEffectiveAt: null,
    billingStatus: "grace_period",
    gracePeriodStartsAt: now,
    gracePeriodEndsAt: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000),
    suspensionEffectiveAt: null,
    peakUsageInBillingPeriod: 0,
    maxConcurrentActiveUsers: 0,
    billingCycleAnchor: now,
    currentPeriodStartsAt: now,
    currentPeriodEndsAt: now,
    lastCommercialSyncAt: now,
    commercialExternalSnapshot: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

class MemDedupe implements BillingNotificationSentRepository {
  private readonly claimed = new Set<string>()
  async tryClaim(workspacePublicId: string, kind: BillingNotificationKind, dedupeKey: string): Promise<boolean> {
    const key = `${workspacePublicId}:${kind}:${dedupeKey}`
    if (this.claimed.has(key)) return false
    this.claimed.add(key)
    return true
  }

  async listRecentByWorkspacePublicId(
    _workspacePublicId: string,
    _limit: number,
  ): Promise<Array<{ kind: BillingNotificationKind; dedupeKey: string; sentAt: Date }>> {
    return []
  }

  async findLatestPerWorkspaceIds(
    _workspacePublicIds: string[],
  ): Promise<Map<string, { kind: BillingNotificationKind; dedupeKey: string; sentAt: Date }>> {
    return new Map()
  }
}

class SnapRepo implements WorkspaceBillingSnapshotRepository {
  constructor(private row: WorkspaceBillingSnapshotProps | null) {}

  async findByWorkspacePublicId(workspacePublicId: string): Promise<WorkspaceBillingSnapshotProps | null> {
    return workspacePublicId === WS ? this.row : null
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

  async countForPlatformFilter(): Promise<number> {
    return 0
  }

  async findForPlatformFilter(
    _filter: unknown,
    _opts: { skip: number; limit: number },
  ): Promise<WorkspaceBillingSnapshotProps[]> {
    return []
  }
}

class CaptureTransactionalEmail {
  calls: Array<{ templateKey: string; to: string }> = []

  async sendWorkspaceBillingTransactional(params: {
    templateKey:
      | "workspace_billing_grace_started"
      | "workspace_billing_suspension_approaching"
      | "workspace_billing_suspended_non_payment"
      | "workspace_billing_recovered"
    toEmail: string
    rendered: RenderedTransactionalEmail
  }): Promise<void> {
    this.calls.push({ templateKey: params.templateKey, to: params.toEmail })
  }
}

function membersRepo(emails: string[]): WorkspaceMemberRepository {
  return {
    async listByWorkspacePublicId(workspacePublicId: string) {
      return workspacePublicId !== WS
        ? []
        : emails.map((emailNormalized) => ({
            membershipPublicId: "m1",
            workspacePublicId: WS,
            userPublicId: "u1",
            emailNormalized,
            status: "active",
            workspaceRoleAdministrative: "admin",
            hasSeatAssigned: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          }))
    },
  } as unknown as WorkspaceMemberRepository
}

const identityRepo = {
  async findByWorkspacePublicId(workspacePublicId: string) {
    return workspacePublicId !== WS
      ? null
      : {
          workspacePublicId: WS,
          displayName: "Acme",
          code: "acme",
          tenantPublicId: "t1",
          createdAt: new Date(),
          updatedAt: new Date(),
        }
  },
} as unknown as WorkspaceIdentityRepository

test("billing manual no envía correo ni consume dedupe de gracia", async () => {
  const dedupe = new MemDedupe()
  const snaps = new SnapRepo(minimalSnapshot({ billingSource: "manual" }))
  const emails = new CaptureTransactionalEmail()
  const svc = new WorkspaceBillingNotificationService(
    emails as unknown as TransactionalEmailService,
    membersRepo(["a@test.local"]),
    identityRepo,
    snaps,
    dedupe,
  )
  const ends = new Date("2026-06-01T12:00:00.000Z")
  await svc.onGraceStarted(WS, ends)
  assert.equal(emails.calls.length, 0)
})

test("dedupe impide segundo intento mismo fin de gracia", async () => {
  const dedupe = new MemDedupe()
  const snaps = new SnapRepo(minimalSnapshot({ billingSource: "paddle" }))
  const emails = new CaptureTransactionalEmail()
  const svc = new WorkspaceBillingNotificationService(
    emails as unknown as TransactionalEmailService,
    membersRepo(["admin@test.local"]),
    identityRepo,
    snaps,
    dedupe,
  )
  const ends = new Date("2026-06-01T12:00:00.000Z")
  await svc.onGraceStarted(WS, ends)
  await svc.onGraceStarted(WS, ends)
  assert.equal(emails.calls.length, 1)
})
