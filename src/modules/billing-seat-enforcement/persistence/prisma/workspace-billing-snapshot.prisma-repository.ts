import type { Prisma, PrismaClient } from "@prisma/client"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { WorkspaceBillingSnapshotProps } from "../../domain/workspace-billing-snapshot.js"
import type {
  WorkspaceBillingSnapshotPlatformFilter,
  WorkspaceBillingSnapshotRepository,
} from "../workspace-billing-snapshot.repository.js"

type SnapshotRow = {
  workspace_public_id: string
  billing_source: string
  subscription_external_id: string | null
  plan_key: string
  included_seats: number
  additional_paid_seats: number
  current_entitled_seats: number
  scheduled_entitled_seats: number | null
  scheduled_seat_change_effective_at: Date | null
  paddle_scheduled_entitled_seats: number | null
  paddle_scheduled_seat_change_effective_at: Date | null
  billing_status: string
  grace_period_starts_at: Date | null
  grace_period_ends_at: Date | null
  suspension_effective_at: Date | null
  peak_usage_in_billing_period: number
  max_concurrent_active_users: number
  billing_cycle_anchor: Date | null
  current_period_starts_at: Date | null
  current_period_ends_at: Date | null
  last_commercial_sync_at: Date | null
  commercial_external_snapshot: string | null
  created_at: Date
  updated_at: Date
}

function rowToSnap(row: SnapshotRow): WorkspaceBillingSnapshotProps {
  return {
    workspacePublicId: row.workspace_public_id,
    billingSource: row.billing_source as WorkspaceBillingSnapshotProps["billingSource"],
    subscriptionExternalId: row.subscription_external_id,
    planKey: row.plan_key,
    includedSeats: row.included_seats,
    additionalPaidSeats: row.additional_paid_seats,
    currentEntitledSeats: row.current_entitled_seats,
    scheduledEntitledSeats: row.scheduled_entitled_seats,
    scheduledSeatChangeEffectiveAt: row.scheduled_seat_change_effective_at,
    paddleScheduledEntitledSeats: row.paddle_scheduled_entitled_seats,
    paddleScheduledSeatChangeEffectiveAt: row.paddle_scheduled_seat_change_effective_at,
    billingStatus: row.billing_status as WorkspaceBillingSnapshotProps["billingStatus"],
    gracePeriodStartsAt: row.grace_period_starts_at,
    gracePeriodEndsAt: row.grace_period_ends_at,
    suspensionEffectiveAt: row.suspension_effective_at,
    peakUsageInBillingPeriod: row.peak_usage_in_billing_period,
    maxConcurrentActiveUsers: row.max_concurrent_active_users,
    billingCycleAnchor: row.billing_cycle_anchor,
    currentPeriodStartsAt: row.current_period_starts_at,
    currentPeriodEndsAt: row.current_period_ends_at,
    lastCommercialSyncAt: row.last_commercial_sync_at,
    commercialExternalSnapshot: row.commercial_external_snapshot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function snapToWriteData(
  row: WorkspaceBillingSnapshotProps,
  workspaceId: string,
): Prisma.BillingWorkspaceSnapshotUncheckedCreateInput {
  return {
    workspace_id: workspaceId,
    workspace_public_id: row.workspacePublicId,
    billing_source: row.billingSource,
    subscription_external_id: row.subscriptionExternalId,
    plan_key: row.planKey,
    included_seats: row.includedSeats,
    additional_paid_seats: row.additionalPaidSeats,
    current_entitled_seats: row.currentEntitledSeats,
    scheduled_entitled_seats: row.scheduledEntitledSeats,
    scheduled_seat_change_effective_at: row.scheduledSeatChangeEffectiveAt,
    paddle_scheduled_entitled_seats: row.paddleScheduledEntitledSeats,
    paddle_scheduled_seat_change_effective_at: row.paddleScheduledSeatChangeEffectiveAt,
    billing_status: row.billingStatus,
    grace_period_starts_at: row.gracePeriodStartsAt,
    grace_period_ends_at: row.gracePeriodEndsAt,
    suspension_effective_at: row.suspensionEffectiveAt,
    peak_usage_in_billing_period: row.peakUsageInBillingPeriod,
    max_concurrent_active_users: row.maxConcurrentActiveUsers,
    billing_cycle_anchor: row.billingCycleAnchor,
    current_period_starts_at: row.currentPeriodStartsAt,
    current_period_ends_at: row.currentPeriodEndsAt,
    last_commercial_sync_at: row.lastCommercialSyncAt,
    commercial_external_snapshot: row.commercialExternalSnapshot,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

function buildPlatformWhere(filter: WorkspaceBillingSnapshotPlatformFilter): Prisma.BillingWorkspaceSnapshotWhereInput {
  const where: Prisma.BillingWorkspaceSnapshotWhereInput = {}
  if (filter.workspacePublicIds && filter.workspacePublicIds.length > 0) {
    where.workspace_public_id = { in: filter.workspacePublicIds }
  }
  if (filter.billingSource) {
    where.billing_source = filter.billingSource
  }
  if (filter.billingStatusIn && filter.billingStatusIn.length > 0) {
    where.billing_status = { in: filter.billingStatusIn }
  }
  return where
}

export class WorkspaceBillingSnapshotPrismaRepository implements WorkspaceBillingSnapshotRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findBySubscriptionExternalId(
    subscriptionExternalId: string,
  ): Promise<WorkspaceBillingSnapshotProps | null> {
    if (!subscriptionExternalId) return null
    const row = await this.prisma.billingWorkspaceSnapshot.findFirst({
      where: { subscription_external_id: subscriptionExternalId },
    })
    return row ? rowToSnap(row as SnapshotRow) : null
  }

  async findByWorkspacePublicId(workspacePublicId: string): Promise<WorkspaceBillingSnapshotProps | null> {
    const row = await this.prisma.billingWorkspaceSnapshot.findUnique({
      where: { workspace_public_id: workspacePublicId },
    })
    return row ? rowToSnap(row as SnapshotRow) : null
  }

  async insertInitial(row: WorkspaceBillingSnapshotProps): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, row.workspacePublicId)
    if (!workspaceId) throw new Error(`workspace_not_found:${row.workspacePublicId}`)
    await this.prisma.billingWorkspaceSnapshot.create({
      data: snapToWriteData(row, workspaceId),
    })
  }

  async replace(row: WorkspaceBillingSnapshotProps): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, row.workspacePublicId)
    if (!workspaceId) throw new Error(`workspace_not_found:${row.workspacePublicId}`)
    const res = await this.prisma.billingWorkspaceSnapshot.updateMany({
      where: { workspace_public_id: row.workspacePublicId },
      data: {
        billing_source: row.billingSource,
        subscription_external_id: row.subscriptionExternalId,
        plan_key: row.planKey,
        included_seats: row.includedSeats,
        additional_paid_seats: row.additionalPaidSeats,
        current_entitled_seats: row.currentEntitledSeats,
        scheduled_entitled_seats: row.scheduledEntitledSeats,
        scheduled_seat_change_effective_at: row.scheduledSeatChangeEffectiveAt,
        paddle_scheduled_entitled_seats: row.paddleScheduledEntitledSeats,
        paddle_scheduled_seat_change_effective_at: row.paddleScheduledSeatChangeEffectiveAt,
        billing_status: row.billingStatus,
        grace_period_starts_at: row.gracePeriodStartsAt,
        grace_period_ends_at: row.gracePeriodEndsAt,
        suspension_effective_at: row.suspensionEffectiveAt,
        peak_usage_in_billing_period: row.peakUsageInBillingPeriod,
        max_concurrent_active_users: row.maxConcurrentActiveUsers,
        billing_cycle_anchor: row.billingCycleAnchor,
        current_period_starts_at: row.currentPeriodStartsAt,
        current_period_ends_at: row.currentPeriodEndsAt,
        last_commercial_sync_at: row.lastCommercialSyncAt,
        commercial_external_snapshot: row.commercialExternalSnapshot,
        updated_at: row.updatedAt,
      },
    })
    if (res.count === 0) throw new Error("workspace_billing_snapshot_not_found")
  }

  async findPaddleLinkedWorkspacePublicIds(limit: number): Promise<string[]> {
    const safe = Math.min(500, Math.max(1, Math.floor(limit)))
    const rows = await this.prisma.billingWorkspaceSnapshot.findMany({
      where: {
        billing_source: "paddle",
        AND: [
          { subscription_external_id: { not: null } },
          { NOT: { subscription_external_id: "" } },
        ],
      },
      take: safe,
      select: { workspace_public_id: true },
    })
    return rows
      .map((r) => r.workspace_public_id)
      .filter((id) => id.length > 0)
  }

  async findGraceSnapshotsEndingWithin(
    now: Date,
    lookaheadMs: number,
  ): Promise<WorkspaceBillingSnapshotProps[]> {
    const upper = new Date(now.getTime() + lookaheadMs)
    const rows = await this.prisma.billingWorkspaceSnapshot.findMany({
      where: {
        billing_status: { in: ["grace_period", "payment_action_required"] },
        grace_period_ends_at: { gt: now, lte: upper },
      },
    })
    return rows.map((r) => rowToSnap(r as SnapshotRow))
  }

  async findSnapshotsWithGraceExpiredBefore(now: Date): Promise<WorkspaceBillingSnapshotProps[]> {
    const rows = await this.prisma.billingWorkspaceSnapshot.findMany({
      where: {
        billing_status: { in: ["grace_period", "payment_action_required"] },
        grace_period_ends_at: { lte: now, not: null },
      },
    })
    return rows.map((r) => rowToSnap(r as SnapshotRow))
  }

  async countForPlatformFilter(filter: WorkspaceBillingSnapshotPlatformFilter): Promise<number> {
    return this.prisma.billingWorkspaceSnapshot.count({ where: buildPlatformWhere(filter) })
  }

  async findForPlatformFilter(
    filter: WorkspaceBillingSnapshotPlatformFilter,
    opts: { skip: number; limit: number },
  ): Promise<WorkspaceBillingSnapshotProps[]> {
    const rows = await this.prisma.billingWorkspaceSnapshot.findMany({
      where: buildPlatformWhere(filter),
      orderBy: { updated_at: "desc" },
      skip: opts.skip,
      take: opts.limit,
    })
    return rows.map((r) => rowToSnap(r as SnapshotRow))
  }
}
