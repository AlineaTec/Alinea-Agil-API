import { WorkActivityNotificationPrismaRepository } from "../../../modules/work-activity-notifications/persistence/prisma/work-activity-notification.prisma-repository.js"
import type { SeedContext } from "./context.js"
import { daysAhead } from "./dates.js"

export async function seedBillingSnapshot(
  ctx: SeedContext,
  workspacePublicId: string,
  seats: number,
): Promise<void> {
  const ws = await ctx.prisma.workspace.findUnique({
    where: { public_id: workspacePublicId },
    select: { id: true },
  })
  if (!ws) return
  const now = ctx.now
  await ctx.prisma.billingWorkspaceSnapshot.upsert({
    where: { workspace_id: ws.id },
    create: {
      workspace_id: ws.id,
      workspace_public_id: workspacePublicId,
      billing_source: "manual",
      subscription_external_id: `seed-sub-${workspacePublicId.slice(0, 8)}`,
      plan_key: "team",
      included_seats: seats,
      additional_paid_seats: 0,
      current_entitled_seats: seats,
      scheduled_entitled_seats: null,
      scheduled_seat_change_effective_at: null,
      paddle_scheduled_entitled_seats: null,
      paddle_scheduled_seat_change_effective_at: null,
      billing_status: "active",
      grace_period_starts_at: null,
      grace_period_ends_at: null,
      suspension_effective_at: null,
      peak_usage_in_billing_period: seats,
      max_concurrent_active_users: seats,
      billing_cycle_anchor: now,
      current_period_starts_at: now,
      current_period_ends_at: daysAhead(now, 30),
      last_commercial_sync_at: now,
      commercial_external_snapshot: null,
      created_at: now,
      updated_at: now,
    },
    update: {
      billing_source: "manual",
      billing_status: "active",
      current_entitled_seats: seats,
      updated_at: now,
    },
  })
  ctx.log("Billing snapshot (seed)")
}

export async function seedProductFeedback(
  ctx: SeedContext,
  opts: {
    workspacePublicId: string
    userPublicId: string
    submissionPublicId: string
    title: string
  },
): Promise<void> {
  const ws = await ctx.prisma.workspace.findUnique({
    where: { public_id: opts.workspacePublicId },
    select: { id: true },
  })
  if (!ws) return
  const now = ctx.now
  await ctx.prisma.productFeedbackSubmission.create({
    data: {
      public_id: opts.submissionPublicId,
      workspace_id: ws.id,
      workspace_public_id: opts.workspacePublicId,
      user_public_id: opts.userPublicId,
      submitter_display_name: "Demo User",
      submission_type: "general_feedback",
      title: opts.title,
      body: "Feedback generado por seed demo para pruebas de producto.",
      module_key: "workspace",
      route: "/workspace/feedback",
      screen_context: { seed: true },
      source_surface: "seed",
      status: "new",
      created_at: now,
      updated_at: now,
    },
  })
  ctx.log("Product feedback submission")
}

export async function seedWorkActivityNotification(
  ctx: SeedContext,
  opts: {
    notificationPublicId: string
    workspacePublicId: string
    projectPublicId: string
    recipientUserPublicId: string
    workItemPublicId: string
    actorUserPublicId: string
    dedupeKey: string
    title: string
  },
): Promise<void> {
  const now = ctx.now
  const repo = new WorkActivityNotificationPrismaRepository(ctx.prisma)
  await repo.insert({
    notificationPublicId: opts.notificationPublicId,
    workspacePublicId: opts.workspacePublicId,
    recipientUserPublicId: opts.recipientUserPublicId,
    eventType: "COMMENT_ADDED",
    eventCategory: "work_activity",
    sourceEntityType: "work_item_comment",
    sourceEntityPublicId: `seed-comment-${opts.workItemPublicId}`,
    projectPublicId: opts.projectPublicId,
    sprintPublicId: null,
    boardColumnPublicId: null,
    title: opts.title,
    summary: "Comentario de demo en ítem de trabajo (seed).",
    actorUserPublicId: opts.actorUserPublicId,
    actorDisplayName: "Demo User",
    triggeredAt: now,
    readAt: null,
    isRead: false,
    isResponsibilityRelated: false,
    isFollowingRelated: true,
    navigationTarget: {
      kind: "scrum_backlog_item",
      projectPublicId: opts.projectPublicId,
      workItemPublicId: opts.workItemPublicId,
      sprintPublicId: null,
      boardColumnPublicId: null,
    },
    groupingKey: null,
    dedupeKey: opts.dedupeKey,
    resourceAvailability: "available",
    retentionExpiresAt: daysAhead(now, 90),
  })
  ctx.log("Work activity notification")
}
