import { workspaceBillingHubUrl } from "../../../config/workspace-app-public-url.js"
import type { BillingRecoveryContext, BillingNotificationPort } from "../domain/billing-notification-port.js"
import type { WorkspaceBillingSnapshotRepository } from "../persistence/workspace-billing-snapshot.repository.js"
import type { BillingNotificationSentRepository } from "../persistence/billing-notification-sent.repository.js"
import type { WorkspaceIdentityRepository } from "../../workspace-users/persistence/workspace-identity.repository.js"
import type { WorkspaceMemberRepository } from "../../workspace-users/persistence/workspace-member.repository.js"
import type { TransactionalEmailService } from "../../transactional-email/services/transactional-email.service.js"
import type { RenderedTransactionalEmail } from "../../transactional-email/templates/rendered-email.js"
import {
  renderWorkspaceBillingGraceStarted,
  renderWorkspaceBillingRecovered,
  renderWorkspaceBillingSuspended,
  renderWorkspaceBillingSuspensionApproaching,
} from "../../transactional-email/templates/workspace-billing-notification-templates.js"

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

function utcLabel(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC"
}

/** Roles administrativos que pueden regularizar licencias / portal (misma política UX que mutaciones licencias). */
function listBillingRecipientEmails(members: { emailNormalized: string; status: string; workspaceRoleAdministrative: string | null }[]): string[] {
  const emails = new Set<string>()
  for (const m of members) {
    if (m.status !== "active") continue
    const r = m.workspaceRoleAdministrative
    if (r === "admin" || r === "operator") {
      emails.add(m.emailNormalized.trim().toLowerCase())
    }
  }
  return [...emails]
}

export class WorkspaceBillingNotificationService implements BillingNotificationPort {
  constructor(
    private readonly transactionalEmail: TransactionalEmailService,
    private readonly workspaceMembers: WorkspaceMemberRepository,
    private readonly workspaceIdentity: WorkspaceIdentityRepository,
    private readonly snapshots: WorkspaceBillingSnapshotRepository,
    private readonly dedupe: BillingNotificationSentRepository,
  ) {}

  async onGraceStarted(workspacePublicId: string, gracePeriodEndsAt: Date): Promise<void> {
    const snapshot = await this.snapshots.findByWorkspacePublicId(workspacePublicId)
    if (!snapshot || snapshot.billingSource === "manual") {
      return
    }

    const dedupeKey = `grace_end:${gracePeriodEndsAt.toISOString()}`
    const claimed = await this.dedupe.tryClaim(workspacePublicId, "billing_grace_started", dedupeKey)
    if (!claimed) return

    const identity = await this.workspaceIdentity.findByWorkspacePublicId(workspacePublicId)
    const members = await this.workspaceMembers.listByWorkspacePublicId(workspacePublicId)
    const recipients = listBillingRecipientEmails(members)
    if (recipients.length === 0) return

    const rendered = renderWorkspaceBillingGraceStarted({
      workspaceDisplayName: identity?.displayName ?? workspacePublicId.slice(0, 8),
      workspaceCode: identity?.code ?? "—",
      gracePeriodEndsAtLabel: utcLabel(gracePeriodEndsAt),
      billingHubUrl: workspaceBillingHubUrl(workspacePublicId),
      isPaddleBilling: snapshot.billingSource === "paddle",
    })

    await this.sendBulk("workspace_billing_grace_started", recipients, rendered)
  }

  /** Job batch: últimos ~3 días antes del fin de gracia (sin dependencia de que abran la app). */
  async runApproachingSuspensionSweep(now = new Date()): Promise<void> {
    const rows = await this.snapshots.findGraceSnapshotsEndingWithin(now, THREE_DAYS_MS)
    for (const snap of rows) {
      if (snap.billingSource === "manual") continue
      const ends = snap.gracePeriodEndsAt
      if (!ends) continue

      const dedupeKey = `grace_end:${ends.toISOString()}`
      const claimed = await this.dedupe.tryClaim(
        snap.workspacePublicId,
        "billing_suspension_approaching",
        dedupeKey,
      )
      if (!claimed) continue

      const identity = await this.workspaceIdentity.findByWorkspacePublicId(snap.workspacePublicId)
      const members = await this.workspaceMembers.listByWorkspacePublicId(snap.workspacePublicId)
      const recipients = listBillingRecipientEmails(members)
      if (recipients.length === 0) continue

      const rendered = renderWorkspaceBillingSuspensionApproaching({
        workspaceDisplayName: identity?.displayName ?? snap.workspacePublicId.slice(0, 8),
        workspaceCode: identity?.code ?? "—",
        suspensionExpectedAfterLabel: utcLabel(ends),
        billingHubUrl: workspaceBillingHubUrl(snap.workspacePublicId),
        isPaddleBilling: snap.billingSource === "paddle",
      })

      await this.sendBulk("workspace_billing_suspension_approaching", recipients, rendered)
    }
  }

  async onSuspendedNonPayment(workspacePublicId: string): Promise<void> {
    const snapshot = await this.snapshots.findByWorkspacePublicId(workspacePublicId)
    if (!snapshot || snapshot.billingSource === "manual") {
      return
    }

    const marker =
      snapshot.suspensionEffectiveAt?.toISOString() ??
      snapshot.gracePeriodEndsAt?.toISOString() ??
      new Date().toISOString()
    const dedupeKey = `suspended:${marker}`
    const claimed = await this.dedupe.tryClaim(workspacePublicId, "billing_suspended_non_payment", dedupeKey)
    if (!claimed) return

    const identity = await this.workspaceIdentity.findByWorkspacePublicId(workspacePublicId)
    const members = await this.workspaceMembers.listByWorkspacePublicId(workspacePublicId)
    const recipients = listBillingRecipientEmails(members)
    if (recipients.length === 0) return

    const rendered = renderWorkspaceBillingSuspended({
      workspaceDisplayName: identity?.displayName ?? workspacePublicId.slice(0, 8),
      workspaceCode: identity?.code ?? "—",
      billingHubUrl: workspaceBillingHubUrl(workspacePublicId),
      isPaddleBilling: snapshot.billingSource === "paddle",
    })

    await this.sendBulk("workspace_billing_suspended_non_payment", recipients, rendered)
  }

  async onPaymentRecovered(workspacePublicId: string, ctx: BillingRecoveryContext): Promise<void> {
    const snapshot = await this.snapshots.findByWorkspacePublicId(workspacePublicId)
    if (!snapshot || snapshot.billingSource === "manual") {
      return
    }

    const dedupeKey = `recover:${ctx.priorGracePeriodEndsAt?.toISOString() ?? "no_grace"}:${ctx.wasSuspended ? "from_suspend" : "not_from_suspend"}`

    const claimed = await this.dedupe.tryClaim(workspacePublicId, "billing_recovered", dedupeKey)
    if (!claimed) return

    const identity = await this.workspaceIdentity.findByWorkspacePublicId(workspacePublicId)
    const members = await this.workspaceMembers.listByWorkspacePublicId(workspacePublicId)
    const recipients = listBillingRecipientEmails(members)
    if (recipients.length === 0) return

    const rendered = renderWorkspaceBillingRecovered({
      workspaceDisplayName: identity?.displayName ?? workspacePublicId.slice(0, 8),
      workspaceCode: identity?.code ?? "—",
      billingHubUrl: workspaceBillingHubUrl(workspacePublicId),
    })

    await this.sendBulk("workspace_billing_recovered", recipients, rendered)
  }

  private async sendBulk(
    templateKey:
      | "workspace_billing_grace_started"
      | "workspace_billing_suspension_approaching"
      | "workspace_billing_suspended_non_payment"
      | "workspace_billing_recovered",
    recipients: string[],
    rendered: RenderedTransactionalEmail,
  ): Promise<void> {
    for (const to of recipients) {
      try {
        await this.transactionalEmail.sendWorkspaceBillingTransactional({ templateKey, toEmail: to, rendered })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(
          JSON.stringify({
            level: "error",
            msg: "workspace_billing_notification_email_failed",
            templateKey,
            detail: msg,
          }),
        )
      }
    }
  }
}
