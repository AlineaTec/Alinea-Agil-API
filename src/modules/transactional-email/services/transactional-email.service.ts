import { randomUUID } from "node:crypto"
import { Resend } from "resend"
import {
  getResendApiKey,
  getTransactionalEmailFrom,
  isTransactionalEmailDisabled,
} from "../config/transactional-email-env.js"
import type { TransactionalTemplateKey } from "../domain/template-key.js"
import type { EmailTransport } from "../providers/email-transport.port.js"
import { NoopEmailTransport } from "../providers/noop-email.transport.js"
import { ResendEmailTransport } from "../providers/resend-email.transport.js"
import { UnconfiguredEmailTransport } from "../providers/unconfigured-email.transport.js"
import { createTransactionalEmailRepositories } from "../../../infrastructure/persistence/transactional-email-repositories.factory.js"
import type { TransactionalEmailOutboundMessageLedger } from "../persistence/transactional-email-outbound-message.repository.js"
import { renderPlatformAdminSessionStarted } from "../templates/platform-admin-session-started.template.js"
import { renderPlatformMfaLockoutNotice } from "../templates/platform-mfa-lockout.template.js"
import type { PlatformUserSecurityNoticeKind } from "../templates/platform-user-security-notice.template.js"
import { renderPlatformUserSecurityNotice } from "../templates/platform-user-security-notice.template.js"
import { renderPlatformUserInvited } from "../templates/platform-user-invited.template.js"
import { renderRegistrationPaymentConfirmation } from "../templates/registration-payment-confirmation.template.js"
import { renderRegistrationVerificationOtp } from "../templates/registration-verification-otp.template.js"
import { renderPlatformAdminPasswordReset } from "../templates/platform-admin-password-reset.template.js"
import { renderIdentityRegisteredUserPasswordReset } from "../templates/registered-user-password-reset.template.js"
import { renderWorkspaceMemberAdded } from "../templates/workspace-member-added.template.js"
import { renderWorkspaceInvitationSent } from "../templates/workspace-invitation-sent.template.js"
import { renderWorkspaceInvitationAccepted } from "../templates/workspace-invitation-accepted.template.js"
import { renderWorkspaceInvitationRevoked } from "../templates/workspace-invitation-revoked.template.js"
import type { RenderedTransactionalEmail } from "../templates/rendered-email.js"
import { summarizeClientForEmail } from "../util/user-agent-summary.js"
import { assertValidTransactionalRecipient } from "../validation/email-recipient.js"

function modalityLabel(modality: string | undefined): string {
  if (modality === "team") return "Equipo (Team)"
  if (modality === "individual") return "Individual"
  return modality ?? "—"
}

function cadenceLabel(cadence: string | undefined): string {
  if (cadence === "annual") return "Anual"
  if (cadence === "monthly") return "Mensual"
  return cadence ?? "—"
}

function resolveEmailTransport(): EmailTransport {
  if (isTransactionalEmailDisabled()) {
    return new NoopEmailTransport()
  }
  const key = getResendApiKey()
  return key ? new ResendEmailTransport(new Resend(key)) : new UnconfiguredEmailTransport()
}

/** Ledger según `TRANSACTIONAL_EMAIL_PERSISTENCE_DRIVER` (inyectable desde `runtimePersistence`). */
export function createTransactionalEmailService(
  ledger: TransactionalEmailOutboundMessageLedger,
): TransactionalEmailService {
  return new TransactionalEmailService(
    resolveEmailTransport(),
    getTransactionalEmailFrom(),
    ledger,
  )
}

export class TransactionalEmailService {
  constructor(
    private readonly transport: EmailTransport,
    private readonly fromAddress: string,
    private readonly ledger: TransactionalEmailOutboundMessageLedger,
  ) {}

  /** Usa driver de env vía factory (tests unitarios o scripts sin runtime). */
  static createDefault(): TransactionalEmailService {
    return createTransactionalEmailService(createTransactionalEmailRepositories().ledger)
  }

  async sendPlatformUserInvited(params: {
    toEmail: string
    displayName: string | null
    roleLabel: string
    invitationNonce: string
  }): Promise<void> {
    const rendered = renderPlatformUserInvited({
      displayName: params.displayName,
      roleLabel: params.roleLabel,
      invitationNonce: params.invitationNonce,
      invitedEmail: params.toEmail.trim(),
    })
    await this.dispatch("platform_user_invited", params.toEmail, rendered)
  }

  async sendIdentityRegisteredUserPasswordReset(params: {
    toEmail: string
    displayName: string | null
    resetUrl: string
  }): Promise<void> {
    const rendered = renderIdentityRegisteredUserPasswordReset({
      displayName: params.displayName,
      resetUrl: params.resetUrl,
      invitedEmail: params.toEmail.trim(),
    })
    await this.dispatch("registered_user_password_reset", params.toEmail, rendered)
  }

  async sendPlatformAdminPasswordReset(params: {
    toEmail: string
    displayName: string | null
    resetUrl: string
  }): Promise<void> {
    const rendered = renderPlatformAdminPasswordReset({
      displayName: params.displayName,
      resetUrl: params.resetUrl,
      invitedEmail: params.toEmail.trim(),
    })
    await this.dispatch("platform_admin_password_reset", params.toEmail, rendered)
  }

  async sendWorkspaceMemberAdded(params: {
    toEmail: string
    displayName: string | null
    invitedEmail: string
    workspaceDisplayName: string
    workspaceCode: string | null
    roleLabel: string
    loginUrl: string
    registerUrl: string
    hasRegisteredAccount: boolean
  }): Promise<void> {
    const rendered = renderWorkspaceMemberAdded({
      displayName: params.displayName,
      invitedEmail: params.invitedEmail.trim(),
      workspaceDisplayName: params.workspaceDisplayName,
      workspaceCode: params.workspaceCode,
      roleLabel: params.roleLabel,
      loginUrl: params.loginUrl,
      registerUrl: params.registerUrl,
      hasRegisteredAccount: params.hasRegisteredAccount,
    })
    await this.dispatch("workspace_member_added", params.toEmail, rendered)
  }

  async sendWorkspaceInvitationSent(params: {
    toEmail: string
    displayName: string | null
    workspaceDisplayName: string
    workspaceCode: string | null
    roleLabel: string
    acceptUrl: string
  }): Promise<void> {
    const rendered = renderWorkspaceInvitationSent({
      displayName: params.displayName,
      invitedEmail: params.toEmail.trim(),
      workspaceDisplayName: params.workspaceDisplayName,
      workspaceCode: params.workspaceCode,
      roleLabel: params.roleLabel,
      acceptUrl: params.acceptUrl,
    })
    await this.dispatch("workspace_invitation_sent", params.toEmail, rendered)
  }

  async sendWorkspaceInvitationAcceptedNotice(params: {
    toEmail: string
    displayName: string | null
    workspaceDisplayName: string
    workspaceCode: string | null
  }): Promise<void> {
    const rendered = renderWorkspaceInvitationAccepted({
      displayName: params.displayName,
      invitedEmail: params.toEmail.trim(),
      workspaceDisplayName: params.workspaceDisplayName,
      workspaceCode: params.workspaceCode,
    })
    await this.dispatch("workspace_invitation_accepted", params.toEmail, rendered)
  }

  async sendWorkspaceInvitationRevokedNotice(params: {
    toEmail: string
    displayName: string | null
    workspaceDisplayName: string
  }): Promise<void> {
    const rendered = renderWorkspaceInvitationRevoked({
      displayName: params.displayName,
      invitedEmail: params.toEmail.trim(),
      workspaceDisplayName: params.workspaceDisplayName,
    })
    await this.dispatch("workspace_invitation_revoked", params.toEmail, rendered)
  }

  async sendRegistrationVerificationOtp(params: {
    toNormalizedEmail: string
    code: string
  }): Promise<void> {
    const rendered = renderRegistrationVerificationOtp({ code: params.code })
    await this.dispatch("registration_verification_otp", params.toNormalizedEmail, rendered)
  }

  async sendRegistrationPaymentConfirmation(params: {
    toNormalizedEmail: string
    intentPublicId: string
    workspaceDisplayName?: string
    workspaceCode?: string
    modality?: string
    billingCadence?: string
  }): Promise<void> {
    const rendered = renderRegistrationPaymentConfirmation({
      intentPublicId: params.intentPublicId,
      workspaceDisplayName: params.workspaceDisplayName,
      workspaceCode: params.workspaceCode,
      planLabel: modalityLabel(params.modality),
      billingCadenceLabel: cadenceLabel(params.billingCadence),
    })
    await this.dispatch("registration_payment_confirmation", params.toNormalizedEmail, rendered)
  }

  async sendPlatformMfaLockoutNotice(params: {
    toEmail: string
    lockedUntil: Date
  }): Promise<void> {
    const rendered = renderPlatformMfaLockoutNotice({
      lockedUntilIso: params.lockedUntil.toISOString(),
    })
    await this.dispatch("platform_mfa_lockout_notice", params.toEmail, rendered)
  }

  /** Aviso informativo tras cambios sensibles (no incluye secretos ni enlaces de acción). */
  async sendPlatformUserSecurityNotice(params: {
    toEmail: string
    kind: PlatformUserSecurityNoticeKind
    greetingName: string
    newRoleLabel?: string
  }): Promise<void> {
    const rendered = renderPlatformUserSecurityNotice({
      kind: params.kind,
      greetingName: params.greetingName,
      newRoleLabel: params.newRoleLabel,
    })
    await this.dispatch("platform_user_security_notice", params.toEmail, rendered)
  }

  async sendPlatformAdminSessionStarted(params: {
    toEmail: string
    greetingName: string
    email: string
    roleLabel: string
    sessionPublicId: string
    sessionStartedAt: Date
    clientIp: string | null
    userAgent: string | null
  }): Promise<void> {
    const rendered = renderPlatformAdminSessionStarted({
      greetingName: params.greetingName,
      email: params.email,
      roleLabel: params.roleLabel,
      sessionPublicId: params.sessionPublicId,
      sessionStartedAtIso: params.sessionStartedAt.toISOString(),
      clientIp: params.clientIp,
      userAgentRaw: params.userAgent,
      clientSummary: summarizeClientForEmail(params.userAgent),
    })
    await this.dispatch("platform_admin_session_started", params.toEmail, rendered)
  }

  async sendWorkspacePaymentReceiptEmail(params: {
    toEmail: string
    rendered: RenderedTransactionalEmail
  }): Promise<void> {
    await this.dispatch("workspace_payment_receipt", params.toEmail, params.rendered)
  }

  /** Correos workspace billing (regularización / impago) — plantillas en `workspace-billing-notification-templates.ts`. */
  async sendWorkspaceBillingTransactional(params: {
    templateKey:
      | "workspace_billing_grace_started"
      | "workspace_billing_suspension_approaching"
      | "workspace_billing_suspended_non_payment"
      | "workspace_billing_recovered"
    toEmail: string
    rendered: RenderedTransactionalEmail
  }): Promise<void> {
    await this.dispatch(params.templateKey, params.toEmail, params.rendered)
  }

  private async dispatch(
    templateKey: TransactionalTemplateKey,
    to: string,
    rendered: RenderedTransactionalEmail,
  ): Promise<void> {
    assertValidTransactionalRecipient(to)
    const normalized = to.trim().toLowerCase()
    const correlationId = randomUUID()
    try {
      const result = await this.transport.send({
        from: this.fromAddress,
        to: normalized,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      })
      await this.ledger.append({
        templateKey,
        toNormalized: normalized,
        ok: true,
        providerMessageId: result.providerMessageId,
        errorMessage: null,
      })
      console.error(
        JSON.stringify({
          level: "info",
          msg: "transactional_email_sent",
          correlationId,
          templateKey,
          to: redactEmailForLog(normalized),
          providerMessageId: result.providerMessageId,
        }),
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await this.ledger.append({
        templateKey,
        toNormalized: normalized,
        ok: false,
        providerMessageId: null,
        errorMessage: msg,
      })
      console.error(
        JSON.stringify({
          level: "error",
          msg: "transactional_email_failed",
          correlationId,
          templateKey,
          to: redactEmailForLog(normalized),
          error: msg,
        }),
      )
      throw err
    }
  }
}

function redactEmailForLog(email: string): string {
  const [local, domain] = email.split("@")
  if (!domain) return "***"
  const safeLocal = local.length <= 2 ? "**" : `${local.slice(0, 2)}…`
  return `${safeLocal}@${domain}`
}
