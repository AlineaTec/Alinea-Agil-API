import { randomUUID } from "node:crypto"
import type { EmailEligibilityResponse } from "../dto/email-eligibility.dto.js"
import type { SetAccountCredentialsResponse } from "../dto/account-credentials.dto.js"
import type { ActivatePaidRegistrationResponse } from "../dto/activate-registration.dto.js"
import type { ConfirmSimulatedPaymentResponse } from "../dto/simulated-payment.dto.js"
import type {
  SetModalityResponse,
  SetWorkspaceIdentityResponse,
  WorkspaceCodeAvailabilityResponse,
} from "../dto/workspace-phase.dto.js"
import type { VerificationConfirmResponse } from "../dto/verification-confirm.dto.js"
import type { VerificationRequestResponse } from "../dto/verification-request.dto.js"
import type { IdentityRegistrationIntent } from "../domain/registration-intent.entity.js"
import type { WorkspaceModality } from "../domain/workspace-modality.js"
import type { BillingCadence } from "../../commercial-pricing/commercial-pricing.constants.js"
import { resolveActiveBillingCadence } from "../../commercial-pricing/billing-cadence.js"
import type { CommercialPlanTier } from "../../commercial-pricing/commercial-pricing.constants.js"
import {
  planTierFromPlanSku,
} from "../../commercial-pricing/commercial-pricing.constants.js"
import type { CommercialQuote } from "../../commercial-pricing/compute-commercial-quote.js"
import {
  computeCommercialQuote,
  effectivePaidTierSeats,
  effectiveLegacyTeamSeatsPurchased,
} from "../../commercial-pricing/compute-commercial-quote.js"
import {
  getWorkspaceCodeFormatIssue,
  getWorkspaceDisplayNameFormatIssue,
  loadReservedWorkspaceCodesNormalized,
  normalizeWorkspaceCode,
  normalizeWorkspaceDisplayName,
} from "../domain/workspace-identity.policy.js"
import {
  VERIFICATION_CHALLENGE_TTL_MS,
  VERIFICATION_MAX_WRONG_ATTEMPTS,
} from "../domain/verification-challenge.policy.js"
import type { AccountLookupPort } from "../integrations/accounts/account-lookup.port.js"
import type { TransactionalEmailPort } from "../integrations/email/transactional-email.port.js"
import type { RegistrationPaymentPort } from "../integrations/payment/payment.port.js"
import {
  fetchPaddleTransactionSummary,
  transactionLooksPaid,
} from "../../../integrations/paddle/fetch-transaction-summary.js"
import type { WorkspaceBillingStateService } from "../../billing-seat-enforcement/services/workspace-billing-state.service.js"
import type { RegistrationProvisioningPort } from "../integrations/provisioning/provisioning.port.js"
import type { IdentityRegistrationIntentRepository } from "../persistence/registration-intent.repository.js"
import type { IdentityVerificationChallengeRepository } from "../persistence/identity-verification-challenge.repository.js"
import {
  normalizeAccountFullName,
  validateAccountFullName,
  validateIntentPasswordPlain,
} from "../domain/account-credentials.policy.js"
import type { SimulatedPaymentOutcome } from "../domain/payment-simulation.policy.js"
import { defaultIntentExpiry } from "./registration-intent-ttl.js"
import { hashIdentityRegistrationIntentPassword } from "./intent-password-hash.js"
import {
  generateNumericOtp,
  hashOtpCodeForStorage,
} from "./verification-otp.js"

/**
 * Expone OTP en JSON solo si `REGISTRATION_EXPOSE_OTP_IN_RESPONSE=true` (desarrollo).
 * En producción debe ser false/absente.
 */
function shouldExposeOtpInResponse(): boolean {
  const v = process.env.REGISTRATION_EXPOSE_OTP_IN_RESPONSE ?? ""
  return v === "true" || v === "1"
}

/**
 * Solo desarrollo (`REGISTRATION_EXPOSE_OTP_IN_RESPONSE`): conserva el OTP en claro
 * para respuestas idempotentes del mismo intento (p. ej. doble montaje en React Strict Mode).
 */
const devOtpPlainByIntentPublicId = new Map<string, string>()

/** Unicidad violada (Prisma P2002 o código 11000 legacy). */
function isMongoDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: number }).code === 11000
  )
}

function commercialQuoteForIntent(intent: IdentityRegistrationIntent): CommercialQuote | null {
  if (intent.modality === undefined) return null
  const planTier = planTierFromPlanSku(intent.planSku)
  return computeCommercialQuote({
    plan: intent.modality,
    billingCadence: resolveActiveBillingCadence(intent.billingCadence),
    teamSeatsRequested:
      intent.modality === "team" ? intent.teamSeatsPurchased : undefined,
    planTier,
  })
}

function modalityForPlanTier(planTier: CommercialPlanTier): WorkspaceModality {
  return planTier === "gratis" ? "individual" : "team"
}

function paddleTransactionIdFromIntent(intent: IdentityRegistrationIntent): string | null {
  const ref = intent.paymentProviderRef?.trim()
  if (!ref?.startsWith("paddle:")) return null
  const id = ref.slice("paddle:".length).trim()
  return id !== "" ? id : null
}

function paddleSubscriptionIdFromIntentMetadata(intent: IdentityRegistrationIntent): string | null {
  const raw = intent.metadata?.paddleSubscriptionExternalId
  if (typeof raw !== "string") return null
  const t = raw.trim()
  return t !== "" ? t : null
}

/**
 * Orquestación por fases.
 * Referencia: contracts-docs/.../api-needs.md (OP-A1, OP-B1…).
 */
export class RegistrationFlowService {
  constructor(
    public readonly registrationIntentRepository: IdentityRegistrationIntentRepository,
    public readonly verificationChallengeRepository: IdentityVerificationChallengeRepository,
    public readonly accountLookup: AccountLookupPort,
    public readonly transactionalEmail: TransactionalEmailPort,
    public readonly registrationPayment: RegistrationPaymentPort,
    public readonly registrationProvisioning: RegistrationProvisioningPort,
    /** Opcional: vincula `sub_*` al snapshot al activar (portal / webhooks sin depender solo de webhooks). */
    public readonly workspaceBillingState: WorkspaceBillingStateService | null = null,
    /**
     * Slug/código ya materializado en workspace (driver activo).
     * Postgres: `workspace_records.code`; columna legacy: `workspaces.slug`.
     */
    private readonly isWorkspaceSlugMaterialized: (
      normalizedSlug: string,
    ) => Promise<boolean> = async () => false,
  ) {}

  /**
   * Fase A — elegibilidad de correo para alta nueva (REG-EMAIL-01, -03, -04).
   */
  async submitEmailEligibility(
    normalizedEmail: string,
  ): Promise<EmailEligibilityResponse> {
    const alreadyRegistered =
      await this.accountLookup.isEmailRegistered(normalizedEmail)
    if (alreadyRegistered) {
      return { eligible: false, reason: "email_already_registered" }
    }

    const now = new Date()
    const existing =
      await this.registrationIntentRepository.findLatestByEmailNormalized(
        normalizedEmail,
      )

    if (existing?.status === "EMAIL_COLLECTED") {
      await this.registrationIntentRepository.updateByPublicId(
        existing.intentPublicId,
        { expiresAt: defaultIntentExpiry(now) },
      )
      return { eligible: true, intentPublicId: existing.intentPublicId }
    }

    const intentPublicId = randomUUID()
    await this.registrationIntentRepository.create({
      intentPublicId,
      emailNormalized: normalizedEmail,
      status: "EMAIL_COLLECTED",
      expiresAt: defaultIntentExpiry(now),
    })

    return { eligible: true, intentPublicId }
  }

  /**
   * Fase B (parcial) — solicitar emisión de código al correo del intento (REG-VERIFY-01, -02).
   * No confirma el código (operación posterior).
   *
   * Requiere intento en `EMAIL_COLLECTED`, no expirado. Invalida desafíos PENDING previos
   * del mismo intent (SUPERSEDED) y crea uno nuevo con hash + TTL.
   */
  async requestVerificationCode(
    intentPublicId: string,
    options?: { reissue?: boolean },
  ): Promise<VerificationRequestResponse> {
    const intent =
      await this.registrationIntentRepository.findByPublicId(intentPublicId)
    if (!intent) {
      return { sent: false, reason: "intent_not_found" }
    }

    if (intent.status !== "EMAIL_COLLECTED") {
      return { sent: false, reason: "invalid_intent_state" }
    }

    const now = new Date()
    if (intent.expiresAt <= now) {
      return { sent: false, reason: "intent_expired" }
    }

    const reissue = options?.reissue === true
    if (!reissue) {
      const existingPending =
        await this.verificationChallengeRepository.findLatestPendingChallengeForIntent(
          intentPublicId,
        )
      if (existingPending && existingPending.expiresAt > now) {
        if (shouldExposeOtpInResponse()) {
          const devCode = devOtpPlainByIntentPublicId.get(intentPublicId)
          if (devCode !== undefined) {
            return { sent: true, devCode }
          }
        }
        return { sent: true }
      }
    }

    devOtpPlainByIntentPublicId.delete(intentPublicId)
    await this.verificationChallengeRepository.supersedePendingForIntent(
      intentPublicId,
    )

    const plainCode = generateNumericOtp()
    const codeHash = hashOtpCodeForStorage(plainCode)
    const challengePublicId = randomUUID()
    const challengeExpiresAt = new Date(
      now.getTime() + VERIFICATION_CHALLENGE_TTL_MS,
    )

    await this.verificationChallengeRepository.create({
      challengePublicId,
      registrationIntentPublicId: intentPublicId,
      emailNormalized: intent.emailNormalized,
      codeHash,
      expiresAt: challengeExpiresAt,
      maxAttempts: VERIFICATION_MAX_WRONG_ATTEMPTS,
    })

    try {
      await this.transactionalEmail.sendRegistrationVerificationEmail({
        toNormalizedEmail: intent.emailNormalized,
        codeOrLink: plainCode,
      })
    } catch {
      await this.verificationChallengeRepository.updateByChallengePublicId(challengePublicId, {
        status: "EXPIRED",
      })
      return { sent: false, reason: "email_delivery_failed" }
    }

    if (shouldExposeOtpInResponse()) {
      devOtpPlainByIntentPublicId.set(intentPublicId, plainCode)
      return { sent: true, devCode: plainCode }
    }

    return { sent: true }
  }

  /**
   * Fase B — confirmar código OTP (REG-VERIFY-03, -04, -08; estados incorrecto/expirado [-05, -06] vía razones).
   *
   * Tras éxito: `IdentityVerificationChallenge` → `CONSUMED`, `IdentityRegistrationIntent` → **`EMAIL_VERIFIED`**
   * (correo verificado en dominio; habilita pasos posteriores en documentación).
   */
  async submitVerificationCode(
    intentPublicId: string,
    plainCode: string,
  ): Promise<VerificationConfirmResponse> {
    const intent =
      await this.registrationIntentRepository.findByPublicId(intentPublicId)
    if (!intent) {
      return { verified: false, reason: "intent_not_found" }
    }

    if (intent.status !== "EMAIL_COLLECTED") {
      return { verified: false, reason: "invalid_intent_state" }
    }

    const now = new Date()
    if (intent.expiresAt <= now) {
      return { verified: false, reason: "intent_expired" }
    }

    const challenge =
      await this.verificationChallengeRepository.findLatestPendingChallengeForIntent(
        intentPublicId,
      )
    if (!challenge) {
      return { verified: false, reason: "challenge_not_found" }
    }

    if (challenge.expiresAt <= now) {
      await this.verificationChallengeRepository.updateByChallengePublicId(
        challenge.challengePublicId,
        { status: "EXPIRED" },
      )
      return { verified: false, reason: "challenge_expired" }
    }

    const offeredHash = hashOtpCodeForStorage(plainCode)
    if (offeredHash !== challenge.codeHash) {
      const nextAttempts = challenge.attemptCount + 1
      if (nextAttempts >= challenge.maxAttempts) {
        await this.verificationChallengeRepository.updateByChallengePublicId(
          challenge.challengePublicId,
          { attemptCount: nextAttempts, status: "EXPIRED" },
        )
        return { verified: false, reason: "max_attempts_reached" }
      }
      await this.verificationChallengeRepository.updateByChallengePublicId(
        challenge.challengePublicId,
        { attemptCount: nextAttempts },
      )
      return {
        verified: false,
        reason: "code_incorrect",
        attemptsRemaining: challenge.maxAttempts - nextAttempts,
      }
    }

    await this.verificationChallengeRepository.updateByChallengePublicId(
      challenge.challengePublicId,
      { status: "CONSUMED" },
    )
    devOtpPlainByIntentPublicId.delete(intentPublicId)
    await this.registrationIntentRepository.updateByPublicId(intentPublicId, {
      status: "EMAIL_VERIFIED",
      expiresAt: defaultIntentExpiry(now),
    })

    return {
      verified: true,
      intentPublicId,
      intentStatus: "EMAIL_VERIFIED",
    }
  }

  /**
   * Fase C — modalidad (`MODALITY_SELECTED`), tier comercial y cotización.
   * Solo desde `EMAIL_VERIFIED` o `MODALITY_SELECTED`; no tras `WORKSPACE_PROPOSED`.
   */
  async setWorkspaceModality(
    intentPublicId: string,
    input: {
      modality?: WorkspaceModality
      planTier?: CommercialPlanTier
      billingCadence: BillingCadence
      teamSeatsRequested?: number
    },
  ): Promise<SetModalityResponse> {
    const intent =
      await this.registrationIntentRepository.findByPublicId(intentPublicId)
    if (!intent) {
      return { ok: false, reason: "intent_not_found" }
    }

    const now = new Date()
    if (intent.expiresAt <= now) {
      return { ok: false, reason: "intent_expired" }
    }

    if (
      intent.status !== "EMAIL_VERIFIED" &&
      intent.status !== "MODALITY_SELECTED"
    ) {
      return { ok: false, reason: "invalid_intent_state" }
    }

    const planTier = input.planTier
    const modality =
      planTier !== undefined
        ? modalityForPlanTier(planTier)
        : input.modality
    if (modality === undefined) {
      return { ok: false, reason: "invalid_intent_state" }
    }

    const billingCadence = "monthly" as const
    const teamSeatsStored =
      modality === "team"
        ? planTier === "estandar" || planTier === "profesional"
          ? effectivePaidTierSeats(input.teamSeatsRequested)
          : effectiveLegacyTeamSeatsPurchased(input.teamSeatsRequested ?? 1)
        : undefined

    const patch = {
      modality,
      planSku: planTier,
      status: "MODALITY_SELECTED" as const,
      billingCadence,
      expiresAt: defaultIntentExpiry(now),
      ...(modality === "team" && teamSeatsStored !== undefined
        ? { teamSeatsPurchased: teamSeatsStored }
        : {}),
    }

    const updated = await this.registrationIntentRepository.updateByPublicId(
      intentPublicId,
      patch,
      modality === "individual" ? { unset: ["teamSeatsPurchased"] } : undefined,
    )
    if (!updated) return { ok: false, reason: "intent_not_found" }

    const commercialQuote = computeCommercialQuote({
      plan: modality,
      billingCadence,
      teamSeatsRequested:
        modality === "team" ? teamSeatsStored : undefined,
      planTier,
    })

    return {
      ok: true,
      intentPublicId,
      intentStatus: "MODALITY_SELECTED",
      modality,
      billingCadence,
      ...(planTier !== undefined ? { planTier } : {}),
      ...(modality === "team" && teamSeatsStored !== undefined
        ? { teamSeatsPurchased: teamSeatsStored }
        : {}),
      commercialQuote,
    }
  }

  /**
   * OP-D1 — pre-check de disponibilidad (no reserva; carreras posibles hasta activación atómica).
   */
  async checkWorkspaceCodeAvailability(
    rawCode: string,
    excludeIntentPublicId?: string,
  ): Promise<WorkspaceCodeAvailabilityResponse> {
    const normalized = normalizeWorkspaceCode(rawCode)
    if (getWorkspaceCodeFormatIssue(normalized)) {
      return { available: false, reason: "invalid_format" }
    }

    if (loadReservedWorkspaceCodesNormalized().has(normalized)) {
      return { available: false, reason: "reserved" }
    }

    if (await this.isWorkspaceSlugMaterialized(normalized)) {
      return { available: false, reason: "taken" }
    }

    const now = new Date()
    const claimer =
      await this.registrationIntentRepository.findClaimingWorkspaceCode(
        normalized,
        now,
      )
    if (
      claimer &&
      claimer.intentPublicId !== excludeIntentPublicId
    ) {
      return { available: false, reason: "taken" }
    }

    return { available: true, codeNormalized: normalized }
  }

  /**
   * Fase D — nombre visible + código normalizado en el intento; estado `WORKSPACE_PROPOSED`.
   */
  async setWorkspaceIdentity(
    intentPublicId: string,
    workspaceNameRaw: string,
    workspaceCodeRaw: string,
  ): Promise<SetWorkspaceIdentityResponse> {
    const intent =
      await this.registrationIntentRepository.findByPublicId(intentPublicId)
    if (!intent) {
      return { ok: false, reason: "intent_not_found" }
    }

    const now = new Date()
    if (intent.expiresAt <= now) {
      return { ok: false, reason: "intent_expired" }
    }

    if (
      intent.status !== "MODALITY_SELECTED" &&
      intent.status !== "WORKSPACE_PROPOSED"
    ) {
      return { ok: false, reason: "invalid_intent_state" }
    }

    if (intent.modality === undefined) {
      return { ok: false, reason: "modality_required" }
    }

    const workspaceName = normalizeWorkspaceDisplayName(workspaceNameRaw)
    if (getWorkspaceDisplayNameFormatIssue(workspaceName)) {
      return { ok: false, reason: "invalid_workspace_name" }
    }

    const normalizedCode = normalizeWorkspaceCode(workspaceCodeRaw)
    if (getWorkspaceCodeFormatIssue(normalizedCode)) {
      return { ok: false, reason: "invalid_workspace_code" }
    }

    if (loadReservedWorkspaceCodesNormalized().has(normalizedCode)) {
      return { ok: false, reason: "code_reserved" }
    }

    const claimer =
      await this.registrationIntentRepository.findClaimingWorkspaceCode(
        normalizedCode,
        now,
      )
    if (claimer && claimer.intentPublicId !== intentPublicId) {
      return { ok: false, reason: "code_taken" }
    }

    try {
      const updated = await this.registrationIntentRepository.updateByPublicId(
        intentPublicId,
        {
          workspaceDisplayName: workspaceName,
          workspaceCode: normalizedCode,
          status: "WORKSPACE_PROPOSED",
          expiresAt: defaultIntentExpiry(now),
        },
      )
      if (!updated) return { ok: false, reason: "intent_not_found" }

      return {
        ok: true,
        intentPublicId,
        intentStatus: "WORKSPACE_PROPOSED",
        workspaceName,
        workspaceCode: normalizedCode,
      }
    } catch (err) {
      if (isMongoDuplicateKeyError(err)) {
        return { ok: false, reason: "code_taken" }
      }
      throw err
    }
  }

  /**
   * Fase E — datos de cuenta en el intento (nombre + hash de contraseña).
   * Estado previo: `WORKSPACE_PROPOSED` o `CREDENTIALS_SET` (reecritura antes de pago).
   * Siguiente estado: `CREDENTIALS_SET`. No crea usuario ni sesión.
   *
   * MFA: no aplicado aquí; ver `account-credentials.policy.ts`.
   */
  async setAccountCredentials(
    intentPublicId: string,
    fullNameRaw: string,
    plainPassword: string,
  ): Promise<SetAccountCredentialsResponse> {
    const intent =
      await this.registrationIntentRepository.findByPublicId(intentPublicId)
    if (!intent) {
      return { ok: false, reason: "intent_not_found" }
    }

    const now = new Date()
    if (intent.expiresAt <= now) {
      return { ok: false, reason: "intent_expired" }
    }

    if (
      intent.status !== "WORKSPACE_PROPOSED" &&
      intent.status !== "CREDENTIALS_SET"
    ) {
      return { ok: false, reason: "invalid_intent_state" }
    }

    const fullName = normalizeAccountFullName(fullNameRaw)
    const nameIssue = validateAccountFullName(fullName)
    if (nameIssue) {
      return { ok: false, reason: nameIssue }
    }

    const pwdIssue = validateIntentPasswordPlain(plainPassword)
    if (pwdIssue) {
      return { ok: false, reason: pwdIssue }
    }

    const passwordHash = hashIdentityRegistrationIntentPassword(plainPassword)

    const updated = await this.registrationIntentRepository.updateByPublicId(
      intentPublicId,
      {
        accountFullName: fullName,
        passwordHash,
        status: "CREDENTIALS_SET",
        expiresAt: defaultIntentExpiry(now),
      },
    )
    if (!updated) return { ok: false, reason: "intent_not_found" }

    return {
      ok: true,
      intentPublicId,
      intentStatus: "CREDENTIALS_SET",
      fullName,
    }
  }

  /**
   * Fase F — confirmación de pago **simulado** (sin proveedor, sin PAN ni id. de transacción real).
   *
   * Estados de entrada: `CREDENTIALS_SET` o `PAYMENT_FAILED` (reintento REG-PAY-03).
   * Éxito: `PAYMENT_SUCCEEDED` (no implica usuario/workspace activos; eso es otra fase).
   * Rechazo / fallo técnico simulado: `PAYMENT_FAILED` y cuerpo `ok: false` con razón explícita.
   */
  async confirmSimulatedPayment(
    intentPublicId: string,
    simulatedOutcome: SimulatedPaymentOutcome = "success",
  ): Promise<ConfirmSimulatedPaymentResponse> {
    const intent =
      await this.registrationIntentRepository.findByPublicId(intentPublicId)

    if (!intent) {
      return { ok: false, reason: "intent_not_found" }
    }

    const now = new Date()
    if (intent.expiresAt <= now) {
      return { ok: false, reason: "intent_expired" }
    }

    if (
      intent.status !== "CREDENTIALS_SET" &&
      intent.status !== "PAYMENT_FAILED"
    ) {
      return { ok: false, reason: "invalid_intent_state" }
    }

    const stamp = now.toISOString()

    if (simulatedOutcome === "success") {
      const quote = commercialQuoteForIntent(intent)
      const metadata = { ...(intent.metadata ?? {}) }
      if (quote !== null) {
        metadata.commercialSnapshotAtPayment = quote
      }
      const updated = await this.registrationIntentRepository.updateByPublicId(
        intentPublicId,
        {
          status: "PAYMENT_SUCCEEDED",
          paymentProviderRef: `sim:ok:${stamp}`,
          expiresAt: defaultIntentExpiry(now),
          metadata,
        },
      )
      if (!updated) return { ok: false, reason: "intent_not_found" }
      try {
        await this.transactionalEmail.sendRegistrationPaymentConfirmation({
          toNormalizedEmail: intent.emailNormalized,
          intentPublicId,
          workspaceDisplayName: intent.workspaceDisplayName,
          workspaceCode: intent.workspaceCode,
          modality: intent.modality,
          billingCadence: intent.billingCadence,
        })
      } catch {
        /* TransactionalEmailService ya registra en ledger + log; no fallar el pago */
      }
      return {
        ok: true,
        intentPublicId,
        intentStatus: "PAYMENT_SUCCEEDED",
      }
    }

    const reason: "payment_declined" | "payment_provider_error" =
      simulatedOutcome === "declined"
        ? "payment_declined"
        : "payment_provider_error"

    const updatedFail =
      await this.registrationIntentRepository.updateByPublicId(intentPublicId, {
        status: "PAYMENT_FAILED",
        paymentProviderRef:
          simulatedOutcome === "declined"
            ? `sim:declined:${stamp}`
            : `sim:provider_error:${stamp}`,
        expiresAt: defaultIntentExpiry(now),
      })
    if (!updatedFail) return { ok: false, reason: "intent_not_found" }

    return {
      ok: false,
      reason,
      intentPublicId,
      intentStatus: "PAYMENT_FAILED",
    }
  }

  /**
   * Fase F — confirmación de plan Gratis ($0): sin pasarela; habilita activación.
   */
  async confirmFreePlanPayment(
    intentPublicId: string,
  ): Promise<ConfirmSimulatedPaymentResponse> {
    const intent =
      await this.registrationIntentRepository.findByPublicId(intentPublicId)

    if (!intent) {
      return { ok: false, reason: "intent_not_found" }
    }

    const now = new Date()
    if (intent.expiresAt <= now) {
      return { ok: false, reason: "intent_expired" }
    }

    if (intent.status !== "CREDENTIALS_SET") {
      return { ok: false, reason: "invalid_intent_state" }
    }

    if (planTierFromPlanSku(intent.planSku) !== "gratis") {
      return { ok: false, reason: "invalid_intent_state" }
    }

    const quote = commercialQuoteForIntent(intent)
    const metadata = { ...(intent.metadata ?? {}) }
    if (quote !== null) {
      metadata.commercialSnapshotAtPayment = quote
    }

    const updated = await this.registrationIntentRepository.updateByPublicId(
      intentPublicId,
      {
        status: "PAYMENT_SUCCEEDED",
        paymentProviderRef: `free:ok:${now.toISOString()}`,
        expiresAt: defaultIntentExpiry(now),
        metadata,
      },
    )
    if (!updated) return { ok: false, reason: "intent_not_found" }

    return {
      ok: true,
      intentPublicId,
      intentStatus: "PAYMENT_SUCCEEDED",
    }
  }

  /**
   * Fase F — confirmación Paddle (checkout completado): verifica TX con Paddle API y marca `PAYMENT_SUCCEEDED`.
   */
  async confirmPaddlePayment(
    intentPublicId: string,
    paddleTransactionIdRaw: string,
  ): Promise<ConfirmSimulatedPaymentResponse> {
    const paddleTransactionId = paddleTransactionIdRaw.trim()
    if (!paddleTransactionId) {
      return { ok: false, reason: "payment_provider_error" }
    }

    const intent =
      await this.registrationIntentRepository.findByPublicId(intentPublicId)

    if (!intent) {
      return { ok: false, reason: "intent_not_found" }
    }

    const now = new Date()
    if (intent.expiresAt <= now) {
      return { ok: false, reason: "intent_expired" }
    }

    if (
      intent.status !== "CREDENTIALS_SET" &&
      intent.status !== "PAYMENT_FAILED"
    ) {
      return { ok: false, reason: "invalid_intent_state" }
    }

    const fetched = await fetchPaddleTransactionSummary(paddleTransactionId)
    if (!fetched.ok) {
      console.warn(
        "[registration] confirmPaddlePayment: Paddle transaction fetch failed",
        {
          txnPrefix: paddleTransactionId.slice(0, 24),
          httpStatus: fetched.httpStatus,
          bodySnippet: fetched.bodySnippet.slice(0, 400),
        },
      )
      return {
        ok: false,
        reason: "payment_provider_error",
      }
    }

    const summary = fetched.summary

    const expectedCd = summary.customDataIntentPublicId
    if (
      expectedCd !== undefined &&
      expectedCd !== null &&
      expectedCd !== "" &&
      expectedCd !== intentPublicId
    ) {
      console.warn("[registration] confirmPaddlePayment: custom_data intent mismatch", {
        intentPublicId,
        fromPaddle: expectedCd,
      })
      return { ok: false, reason: "payment_provider_error" }
    }

    if (!transactionLooksPaid(summary)) {
      await this.registrationIntentRepository.updateByPublicId(intentPublicId, {
        status: "PAYMENT_FAILED",
        paymentProviderRef: `paddle:unpaid:${summary.id}:${now.toISOString()}`,
        expiresAt: defaultIntentExpiry(now),
      })
      return {
        ok: false,
        reason: "payment_declined",
        intentPublicId,
        intentStatus: "PAYMENT_FAILED",
      }
    }

    const quote = commercialQuoteForIntent(intent)
    const metadata = { ...(intent.metadata ?? {}) }
    if (quote !== null) {
      metadata.commercialSnapshotAtPayment = quote
    }
    if (summary.audit) {
      metadata.paddlePaymentAudit = summary.audit
    }
    if (summary.subscriptionId?.trim()) {
      metadata.paddleSubscriptionExternalId = summary.subscriptionId.trim()
    }

    const updated = await this.registrationIntentRepository.updateByPublicId(
      intentPublicId,
      {
        status: "PAYMENT_SUCCEEDED",
        paymentProviderRef: `paddle:${summary.id}`,
        expiresAt: defaultIntentExpiry(now),
        metadata,
      },
    )
    if (!updated) return { ok: false, reason: "intent_not_found" }
    try {
      await this.transactionalEmail.sendRegistrationPaymentConfirmation({
        toNormalizedEmail: intent.emailNormalized,
        intentPublicId,
        workspaceDisplayName: intent.workspaceDisplayName,
        workspaceCode: intent.workspaceCode,
        modality: intent.modality,
        billingCadence: intent.billingCadence,
      })
    } catch {
      /* TransactionalEmailService ya registra en ledger + log; no fallar el pago */
    }
    return {
      ok: true,
      intentPublicId,
      intentStatus: "PAYMENT_SUCCEEDED",
    }
  }

  /**
   * Activación / provisioning — solo desde `PAYMENT_SUCCEEDED` (separado del pago).
   * Idempotente: si el intento ya está `ACTIVE` con IDs de materialización, devuelve éxito.
   * Persiste usuario, workspace y membresía owner en transacción Prisma.
   */
  async activatePaidRegistration(
    intentPublicId: string,
  ): Promise<ActivatePaidRegistrationResponse> {
    const intent =
      await this.registrationIntentRepository.findByPublicId(intentPublicId)
    if (!intent) {
      return { ok: false, reason: "intent_not_found" }
    }

    const now = new Date()
    if (intent.expiresAt <= now) {
      return { ok: false, reason: "intent_expired" }
    }

    if (intent.status === "ACTIVE") {
      if (
        intent.provisionedUserPublicId !== undefined &&
        intent.provisionedWorkspacePublicId !== undefined &&
        intent.workspaceCode !== undefined &&
        intent.workspaceDisplayName !== undefined
      ) {
        return {
          ok: true,
          intentPublicId,
          intentStatus: "ACTIVE",
          userPublicId: intent.provisionedUserPublicId,
          workspacePublicId: intent.provisionedWorkspacePublicId,
          workspaceCode: intent.workspaceCode,
          workspaceDisplayName: intent.workspaceDisplayName,
          membershipRole: "owner",
        }
      }
      return { ok: false, reason: "invalid_intent_state" }
    }

    if (intent.status !== "PAYMENT_SUCCEEDED") {
      return { ok: false, reason: "invalid_intent_state" }
    }

    if (
      intent.modality === undefined ||
      intent.workspaceDisplayName === undefined ||
      intent.workspaceCode === undefined ||
      intent.accountFullName === undefined ||
      intent.passwordHash === undefined
    ) {
      return { ok: false, reason: "incomplete_registration_data" }
    }

    const normalizedCode = normalizeWorkspaceCode(intent.workspaceCode)
    if (getWorkspaceCodeFormatIssue(normalizedCode)) {
      return { ok: false, reason: "workspace_code_invalid" }
    }
    if (loadReservedWorkspaceCodesNormalized().has(normalizedCode)) {
      return { ok: false, reason: "workspace_code_invalid" }
    }
    if (normalizedCode !== intent.workspaceCode) {
      return { ok: false, reason: "workspace_code_invalid" }
    }

    if (getWorkspaceDisplayNameFormatIssue(intent.workspaceDisplayName)) {
      return { ok: false, reason: "invalid_workspace_identity" }
    }

    try {
      const result =
        await this.registrationProvisioning.provisionPaidRegistration({
          intentPublicId,
          emailNormalized: intent.emailNormalized,
          accountFullName: intent.accountFullName,
          passwordHash: intent.passwordHash,
          modality: intent.modality,
          billingCadence: intent.billingCadence ?? "monthly",
          teamSeatsPurchased: intent.teamSeatsPurchased,
          planTier: planTierFromPlanSku(intent.planSku),
          workspaceDisplayName: intent.workspaceDisplayName,
          workspaceCode: normalizedCode,
          priorMetadata: intent.metadata,
        })

      await this.linkPaddleSubscriptionFromIntent(result.workspacePublicId, intent, now)
      await this.sendRegistrationWelcomeBestEffort(intent, normalizedCode)

      return {
        ok: true,
        intentPublicId,
        intentStatus: "ACTIVE",
        userPublicId: result.userPublicId,
        workspacePublicId: result.workspacePublicId,
        workspaceCode: normalizedCode,
        workspaceDisplayName: intent.workspaceDisplayName,
        membershipRole: result.membershipRole,
      }
    } catch (err) {
      const reloaded =
        await this.registrationIntentRepository.findByPublicId(intentPublicId)
      if (
        reloaded?.status === "ACTIVE" &&
        reloaded.provisionedUserPublicId !== undefined &&
        reloaded.provisionedWorkspacePublicId !== undefined &&
        reloaded.workspaceCode !== undefined &&
        reloaded.workspaceDisplayName !== undefined
      ) {
        await this.linkPaddleSubscriptionFromIntent(
          reloaded.provisionedWorkspacePublicId!,
          reloaded,
          now,
        )
        return {
          ok: true,
          intentPublicId,
          intentStatus: "ACTIVE",
          userPublicId: reloaded.provisionedUserPublicId,
          workspacePublicId: reloaded.provisionedWorkspacePublicId!,
          workspaceCode: reloaded.workspaceCode,
          workspaceDisplayName: reloaded.workspaceDisplayName,
          membershipRole: "owner",
        }
      }

      if (isMongoDuplicateKeyError(err)) {
        return { ok: false, reason: "provision_failed" }
      }
      if (
        err instanceof Error &&
        err.message === "registration_intent_not_payment_succeeded"
      ) {
        return { ok: false, reason: "invalid_intent_state" }
      }
      throw err
    }
  }

  private async sendRegistrationWelcomeBestEffort(
    intent: IdentityRegistrationIntent,
    workspaceCode: string,
  ): Promise<void> {
    if (
      intent.accountFullName === undefined ||
      intent.workspaceDisplayName === undefined
    ) {
      return
    }
    try {
      await this.transactionalEmail.sendRegistrationWelcome({
        toNormalizedEmail: intent.emailNormalized,
        accountFullName: intent.accountFullName,
        workspaceDisplayName: intent.workspaceDisplayName,
        workspaceCode,
        planTier: planTierFromPlanSku(intent.planSku),
      })
    } catch {
      /* ledger + log en TransactionalEmailService */
    }
  }

  /**
   * Materializa vínculo `subscriptionExternalId` para portal Paddle / coherencia con webhooks.
   * Idempotente vía `linkSubscriptionExternalId` en billing state.
   */
  private async linkPaddleSubscriptionFromIntent(
    workspacePublicId: string,
    intent: IdentityRegistrationIntent,
    now: Date,
  ): Promise<void> {
    if (!this.workspaceBillingState) return

    let subId = paddleSubscriptionIdFromIntentMetadata(intent)

    if (!subId) {
      const txnId = paddleTransactionIdFromIntent(intent)
      if (txnId) {
        const fetched = await fetchPaddleTransactionSummary(txnId)
        if (fetched.ok && fetched.summary.subscriptionId?.trim()) {
          subId = fetched.summary.subscriptionId.trim()
        }
      }
    }

    if (!subId) return

    try {
      await this.workspaceBillingState.linkSubscriptionExternalId(workspacePublicId, subId, now)
    } catch (err) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "registration_paddle_subscription_link_failed",
          workspacePublicId,
          detail: err instanceof Error ? err.message : String(err),
        }),
      )
    }
  }
}
