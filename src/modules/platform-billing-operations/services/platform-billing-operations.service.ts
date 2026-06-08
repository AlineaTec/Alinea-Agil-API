import type { BillingNotificationKind } from "../../billing-seat-enforcement/domain/billing-notification-kind.js"
import type { WorkspaceBillingSnapshotProps } from "../../billing-seat-enforcement/domain/workspace-billing-snapshot.js"
import type { BillingSource, WorkspaceBillingStatus } from "../../billing-seat-enforcement/domain/workspace-billing-status.js"
import type { BillingNotificationSentRepository } from "../../billing-seat-enforcement/persistence/billing-notification-sent.repository.js"
import type { WorkspaceBillingAuditRepository } from "../../billing-seat-enforcement/persistence/workspace-billing-audit.repository.js"
import type {
  WorkspaceBillingSnapshotPlatformFilter,
  WorkspaceBillingSnapshotRepository,
} from "../../billing-seat-enforcement/persistence/workspace-billing-snapshot.repository.js"
import { mergeScheduledEntitlementForDisplay } from "../../billing-seat-enforcement/services/workspace-billing-state.service.js"
import type {
  PaddleCommercialReconcileResult,
  PaddleCommercialReconcileService,
} from "../../billing-seat-enforcement/services/paddle-commercial-reconcile.service.js"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import type { WorkspaceCatalogRepository } from "../../platform-tenants/persistence/workspace-catalog.repository.js"
import type { WorkspaceMemberRepository } from "../../workspace-users/persistence/workspace-member.repository.js"
import { assertPlatformSessionCanReadTenants } from "../../platform-tenants/policies/platform-tenants.policy.js"
import { PlatformTenantForbiddenError } from "../../platform-tenants/domain/platform-tenant.errors.js"
import type { PlatformAuditService } from "../../platform-users/services/platform-audit.service.js"
import type { PlatformBillingWorkspacesListQuery } from "../validation/platform-billing-operations-http.schemas.js"

const ATTENTION_AUDIT_TYPES = [
  "paddle_commercial_reconcile_divergence_noted",
  "paddle_commercial_reconcile_license_conflict",
  "paddle_commercial_reconcile_failed",
] as const

const SCAN_CAP = 600

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null
}

function statusGroupToStatuses(group: PlatformBillingWorkspacesListQuery["statusGroup"]): WorkspaceBillingStatus[] | undefined {
  if (group === "all") return undefined
  if (group === "active") return ["active"]
  if (group === "grace") return ["grace_period", "payment_action_required"]
  if (group === "suspended") return ["suspended_non_payment"]
  return undefined
}

function billingSourceParam(source: PlatformBillingWorkspacesListQuery["billingSource"]): BillingSource | undefined {
  if (source === "all") return undefined
  return source
}

export type PlatformBillingWorkspaceListRow = {
  workspacePublicId: string
  displayName: string
  code: string
  billingStatus: WorkspaceBillingStatus
  billingSource: BillingSource
  currentEntitledSeats: number
  activeAssignedUsers: number
  overCapacity: boolean
  gracePeriodStartsAt: string | null
  gracePeriodEndsAt: string | null
  suspensionEffectiveAt: string | null
  scheduledSeatSummary: string | null
  subscriptionExternalId: string | null
  lastCommercialSyncAt: string | null
  missingSubscriptionLink: boolean
  attentionEventType: string | null
  attentionAt: string | null
  lastNotification: null | {
    kind: BillingNotificationKind
    dedupeKey: string
    sentAt: string
  }
}

export type PlatformBillingWorkspaceDetail = {
  workspacePublicId: string
  displayName: string
  code: string
  snapshot: WorkspaceBillingSnapshotProps
  activeAssignedUsers: number
  availableSeatsRaw: number
  overCapacity: boolean
  scheduledSeatSummary: string | null
  commercialSnapshotSummary: {
    lines: string[]
    rawPreview: string | null
  }
  reconcileHints: {
    missingSubscriptionLink: boolean
    manualBillingSkipsPaddleReconcile: boolean
    lastAttentionEvent: null | { eventType: string; createdAt: string }
  }
  auditRecent: Array<{ eventType: string; payload: Record<string, unknown>; createdAt: string }>
  notificationsRecent: Array<{
    kind: BillingNotificationKind
    dedupeKey: string
    sentAt: string
    recipientPolicy: "workspace_admin_or_operator_active"
  }>
}

export class PlatformBillingOperationsService {
  constructor(
    private readonly snapshots: WorkspaceBillingSnapshotRepository,
    private readonly billingAudit: WorkspaceBillingAuditRepository,
    private readonly billingNotifications: BillingNotificationSentRepository,
    private readonly members: WorkspaceMemberRepository,
    private readonly catalog: WorkspaceCatalogRepository,
    private readonly reconcile: PaddleCommercialReconcileService,
    private readonly platformAudit: PlatformAuditService | null = null,
  ) {}

  assertCanRead(session: PlatformSessionContext): void {
    assertPlatformSessionCanReadTenants(session)
  }

  assertCanTriggerReconcile(session: PlatformSessionContext): void {
    this.assertCanRead(session)
    if (session.role === "platform_auditor") {
      throw new PlatformTenantForbiddenError("FORBIDDEN", "Los auditores de plataforma no pueden ejecutar reconciliaciones.")
    }
  }

  async listWorkspaces(
    session: PlatformSessionContext,
    query: PlatformBillingWorkspacesListQuery,
  ): Promise<{ total: number; items: PlatformBillingWorkspaceListRow[] }> {
    this.assertCanRead(session)

    const qTrim = query.q?.trim()
    let workspacePublicIds: string[] | undefined
    if (qTrim && qTrim.length > 0) {
      const rows = await this.catalog.listAll(qTrim)
      workspacePublicIds = rows.map((r) => r.workspacePublicId)
      if (workspacePublicIds.length === 0) {
        return { total: 0, items: [] }
      }
    }

    const mongoFilter: WorkspaceBillingSnapshotPlatformFilter = {
      workspacePublicIds,
      billingSource: billingSourceParam(query.billingSource),
      billingStatusIn: statusGroupToStatuses(query.statusGroup),
    }

    const limit = query.limit ?? 25
    const offset = query.offset ?? 0

    const needPostFilter = query.onlyOverCapacity === true || query.onlyAttention === true

    if (!needPostFilter) {
      const total = await this.snapshots.countForPlatformFilter(mongoFilter)
      const snaps = await this.snapshots.findForPlatformFilter(mongoFilter, { skip: offset, limit })
      const items = await this.buildListRows(snaps)
      return { total, items }
    }

    const snaps = await this.snapshots.findForPlatformFilter(mongoFilter, { skip: 0, limit: SCAN_CAP })
    let enriched = await this.buildListRows(snaps)

    if (query.onlyOverCapacity === true) {
      enriched = enriched.filter((r) => r.overCapacity)
    }
    if (query.onlyAttention === true) {
      enriched = enriched.filter(
        (r) =>
          r.missingSubscriptionLink ||
          r.attentionEventType !== null ||
          r.attentionAt !== null,
      )
    }

    const total = enriched.length
    const page = enriched.slice(offset, offset + limit)
    return { total, items: page }
  }

  private async buildListRows(snaps: WorkspaceBillingSnapshotProps[]): Promise<PlatformBillingWorkspaceListRow[]> {
    const ids = snaps.map((s) => s.workspacePublicId)
    const attentionMap = await this.billingAudit.findLatestAttentionEventsByWorkspaceIds(ids, ATTENTION_AUDIT_TYPES)
    const notifMap = await this.billingNotifications.findLatestPerWorkspaceIds(ids)

    const out: PlatformBillingWorkspaceListRow[] = []
    for (const snap of snaps) {
      const wid = snap.workspacePublicId
      const catalogRow = await this.catalog.findByPublicId(wid)
      const activeAssignedUsers = await this.members.countActiveSeatConsumingMembers(wid)
      const overCapacity = activeAssignedUsers > snap.currentEntitledSeats
      const merged = mergeScheduledEntitlementForDisplay(snap)
      const scheduledSeatSummary =
        merged.seats != null && merged.effectiveAt
          ? `${merged.seats} asientos · efectivo ${merged.effectiveAt.toISOString()}`
          : null

      const missingSubscriptionLink = snap.billingSource === "paddle" && !snap.subscriptionExternalId?.trim()
      const att = attentionMap.get(wid)
      const n = notifMap.get(wid)

      out.push({
        workspacePublicId: wid,
        displayName: catalogRow?.displayName ?? wid.slice(0, 8),
        code: catalogRow?.code ?? "—",
        billingStatus: snap.billingStatus,
        billingSource: snap.billingSource,
        currentEntitledSeats: snap.currentEntitledSeats,
        activeAssignedUsers,
        overCapacity,
        gracePeriodStartsAt: iso(snap.gracePeriodStartsAt),
        gracePeriodEndsAt: iso(snap.gracePeriodEndsAt),
        suspensionEffectiveAt: iso(snap.suspensionEffectiveAt),
        scheduledSeatSummary,
        subscriptionExternalId: snap.subscriptionExternalId,
        lastCommercialSyncAt: iso(snap.lastCommercialSyncAt),
        missingSubscriptionLink,
        attentionEventType: att?.eventType ?? null,
        attentionAt: att ? att.createdAt.toISOString() : null,
        lastNotification: n
          ? { kind: n.kind, dedupeKey: n.dedupeKey, sentAt: n.sentAt.toISOString() }
          : null,
      })
    }
    return out
  }

  async getWorkspaceDetail(session: PlatformSessionContext, workspacePublicId: string): Promise<PlatformBillingWorkspaceDetail> {
    this.assertCanRead(session)

    const snap = await this.snapshots.findByWorkspacePublicId(workspacePublicId)
    if (!snap) {
      throw new PlatformBillingOperationsNotFoundError()
    }

    const catalogRow = await this.catalog.findByPublicId(workspacePublicId)
    const activeAssignedUsers = await this.members.countActiveSeatConsumingMembers(workspacePublicId)
    const availableSeatsRaw = snap.currentEntitledSeats - activeAssignedUsers
    const overCapacity = activeAssignedUsers > snap.currentEntitledSeats
    const merged = mergeScheduledEntitlementForDisplay(snap)
    const scheduledSeatSummary =
      merged.seats != null && merged.effectiveAt
        ? `${merged.seats} asientos · efectivo ${merged.effectiveAt.toISOString()}`
        : null

    const missingSubscriptionLink = snap.billingSource === "paddle" && !snap.subscriptionExternalId?.trim()

    const attentionMap = await this.billingAudit.findLatestAttentionEventsByWorkspaceIds(
      [workspacePublicId],
      ATTENTION_AUDIT_TYPES,
    )
    const att = attentionMap.get(workspacePublicId)

    const auditRecentRaw = await this.billingAudit.listRecentByWorkspacePublicId(workspacePublicId, 80)
    const notificationsRaw = await this.billingNotifications.listRecentByWorkspacePublicId(workspacePublicId, 80)

    const commercialSnapshotSummary = summarizeCommercialSnapshot(snap.commercialExternalSnapshot)

    return {
      workspacePublicId,
      displayName: catalogRow?.displayName ?? workspacePublicId.slice(0, 8),
      code: catalogRow?.code ?? "—",
      snapshot: snap,
      activeAssignedUsers,
      availableSeatsRaw,
      overCapacity,
      scheduledSeatSummary,
      commercialSnapshotSummary,
      reconcileHints: {
        missingSubscriptionLink,
        manualBillingSkipsPaddleReconcile: snap.billingSource === "manual",
        lastAttentionEvent: att
          ? { eventType: att.eventType, createdAt: att.createdAt.toISOString() }
          : null,
      },
      auditRecent: auditRecentRaw.map((e) => ({
        eventType: e.eventType,
        payload: e.payload,
        createdAt: e.createdAt.toISOString(),
      })),
      notificationsRecent: notificationsRaw.map((n) => ({
        kind: n.kind,
        dedupeKey: n.dedupeKey,
        sentAt: n.sentAt.toISOString(),
        recipientPolicy: "workspace_admin_or_operator_active",
      })),
    }
  }

  async reconcileWorkspaceNow(
    session: PlatformSessionContext,
    workspacePublicId: string,
  ): Promise<PaddleCommercialReconcileResult> {
    this.assertCanTriggerReconcile(session)
    const result = await this.reconcile.reconcileWorkspace(workspacePublicId, new Date())
    const audit = this.platformAudit
    if (audit) {
      try {
        await audit.recordWorkspaceOperationEvent(
          { platformUserId: session.platformUserId, role: session.role },
          "billing.workspace_paddle_reconcile",
          workspacePublicId,
          `Reconciliación Paddle manual · workspace ${workspacePublicId} · resultado ${result.status}`,
          null,
          reconcileResultAuditPayload(result),
        )
      } catch {
        /* La reconciliación ya aplicó; no fallar la respuesta HTTP si el append de auditoría falla. */
      }
    }
    return result
  }
}

export class PlatformBillingOperationsNotFoundError extends Error {
  readonly code = "platform_billing_ops_workspace_not_found"
  constructor() {
    super("workspace_billing_snapshot_not_found")
    this.name = "PlatformBillingOperationsNotFoundError"
  }
}

function reconcileResultAuditPayload(r: PaddleCommercialReconcileResult): Record<string, unknown> {
  switch (r.status) {
    case "skipped":
      return { status: r.status, reason: r.reason }
    case "failed":
      return {
        status: r.status,
        reason: r.reason,
        httpStatus: r.httpStatus,
        bodySnippet: r.bodySnippet.length > 400 ? `${r.bodySnippet.slice(0, 400)}…` : r.bodySnippet,
      }
    case "license_conflict":
      return {
        status: r.status,
        detail: r.detail.length > 500 ? `${r.detail.slice(0, 500)}…` : r.detail,
      }
    case "applied":
      return { status: r.status, commercialEffectKeyCount: Object.keys(r.commercialEffect).length }
    default:
      return { status: "unknown" }
  }
}

function summarizeCommercialSnapshot(raw: string | null): PlatformBillingWorkspaceDetail["commercialSnapshotSummary"] {
  if (!raw || raw.trim().length === 0) {
    return { lines: [], rawPreview: null }
  }
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const lines: string[] = []
    if (typeof o.kind === "string") lines.push(`kind: ${o.kind}`)
    if (typeof o.materializedAt === "string") lines.push(`materializedAt: ${o.materializedAt}`)
    return {
      lines,
      rawPreview: raw.length > 400 ? `${raw.slice(0, 400)}…` : raw,
    }
  } catch {
    return {
      lines: [],
      rawPreview: raw.length > 400 ? `${raw.slice(0, 400)}…` : raw,
    }
  }
}
