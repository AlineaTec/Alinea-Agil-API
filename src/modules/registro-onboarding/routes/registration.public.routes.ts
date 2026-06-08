import { Router, type Request, type RequestHandler, type Response, type NextFunction } from "express"
import { commercialRegistrationApiGate } from "../../../config/payment-gateway-policy.js"
import { ensureTurnstileForRequest } from "../../../infra/turnstile/ensure-turnstile-for-request.js"
import { computeCommercialQuote } from "../../commercial-pricing/compute-commercial-quote.js"
import { getAnnualDiscountRate } from "../../commercial-pricing/annual-discount-rate.js"
import {
  ADDITIONAL_SEAT_MONTHLY_USD,
  ANNUAL_DISCOUNT_RATE_CAP,
  ANNUAL_DISCOUNT_RATE_DEFAULT,
  COMMERCIAL_CURRENCY,
  INDIVIDUAL_MONTHLY_USD,
  TEAM_BASE_MONTHLY_USD,
  TEAM_MIN_SEATS,
  TEAM_SEAT_MONTHLY_USD,
} from "../../commercial-pricing/commercial-pricing.constants.js"
import { normalizeWorkspaceModality } from "../domain/workspace-modality.js"
import type { CommercialPlanTier } from "../../commercial-pricing/commercial-pricing.constants.js"
import type { RegistrationFlowService } from "../services/registration-flow.service.js"
import {
  activateRegistrationBodySchema,
  commercialQuoteBodySchema,
  confirmFreePlanPaymentBodySchema,
  confirmPaddlePaymentBodySchema,
  confirmSimulatedPaymentBodySchema,
  emailEligibilityBodySchema,
  setAccountCredentialsBodySchema,
  setModalityBodySchema,
  verificationConfirmBodySchema,
  verificationRequestBodySchema,
  workspaceCodeAvailabilityBodySchema,
  workspaceIdentityBodySchema,
} from "../validation/registration.schemas.js"

export function createPaddleCompleteHandler(registrationFlowService: RegistrationFlowService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = confirmPaddlePaymentBodySchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_request",
          message:
            'Se espera JSON { "intentPublicId": string (UUID), "paddleTransactionId": string }.',
          details: parsed.error.flatten(),
        })
        return
      }

      const result = await registrationFlowService.confirmPaddlePayment(
        parsed.data.intentPublicId,
        parsed.data.paddleTransactionId,
      )
      res.status(200).json(result)
    } catch (err) {
      next(err)
    }
  }
}

/**
 * Rutas públicas bajo `/v1/public/registration`.
 * Ver `api-needs.md` (tabla OP-*) para el mapa completo.
 */
export function createRegistrationPublicRouter(
  registrationFlowService: RegistrationFlowService,
  registrationCriticalRateLimit: RequestHandler,
): Router {
  const router = Router()

  router.get("/commercial-catalog", (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json({
        currency: COMMERCIAL_CURRENCY,
        individualMonthlyUsd: INDIVIDUAL_MONTHLY_USD,
        teamBaseMonthlyUsd: TEAM_BASE_MONTHLY_USD,
        additionalSeatMonthlyUsd: ADDITIONAL_SEAT_MONTHLY_USD,
        /** @deprecated Preferir `additionalSeatMonthlyUsd` — mismo valor; nombre legado. */
        teamSeatMonthlyUsd: TEAM_SEAT_MONTHLY_USD,
        teamMinSeats: TEAM_MIN_SEATS,
        teamIncludedSeats: TEAM_MIN_SEATS,
        annualDiscountRateDefault: ANNUAL_DISCOUNT_RATE_DEFAULT,
        annualDiscountRateCap: ANNUAL_DISCOUNT_RATE_CAP,
        annualDiscountRateApplied: getAnnualDiscountRate(),
      })
    } catch (err) {
      next(err)
    }
  })

  router.post(
    "/commercial-quote",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = commercialQuoteBodySchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({
            error: "invalid_request",
            message:
              'Se espera JSON { "planTier"?: "free" | "team" | "pro", "modality"?: "individual" | "team" | "empresa", "billingCadence": "monthly", "teamSeatsPurchased"?: number }.',
            details: parsed.error.flatten(),
          })
          return
        }
        const planTier = parsed.data.planTier as CommercialPlanTier | undefined
        const modality =
          planTier !== undefined
            ? planTier === "free"
              ? "individual"
              : "team"
            : normalizeWorkspaceModality(parsed.data.modality ?? "team")
        if (!modality) {
          res.status(400).json({
            error: "invalid_request",
            message: "modalidad no válida",
          })
          return
        }
        const quote = computeCommercialQuote({
          plan: modality,
          billingCadence: parsed.data.billingCadence,
          teamSeatsRequested:
            modality === "team" ? parsed.data.teamSeatsPurchased : undefined,
          planTier,
        })
        res.status(200).json(quote)
      } catch (err) {
        next(err)
      }
    },
  )

  router.post(
    "/email-eligibility",
    registrationCriticalRateLimit,
    commercialRegistrationApiGate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = emailEligibilityBodySchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({
            error: "invalid_request",
            message:
              'Se espera JSON { "email": string } con correo en formato válido.',
            details: parsed.error.flatten(),
          })
          return
        }

        const turnstileOk = await ensureTurnstileForRequest(
          req,
          res,
          parsed.data.turnstileToken,
        )
        if (!turnstileOk) return

        const result = await registrationFlowService.submitEmailEligibility(
          parsed.data.email,
        )
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },
  )

  router.post(
    "/verification/request",
    registrationCriticalRateLimit,
    commercialRegistrationApiGate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = verificationRequestBodySchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({
            error: "invalid_request",
            message:
              'Se espera JSON { "intentPublicId": string } (UUID del intento).',
            details: parsed.error.flatten(),
          })
          return
        }

        const result = await registrationFlowService.requestVerificationCode(
          parsed.data.intentPublicId,
        )
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },
  )

  router.post(
    "/verification/confirm",
    registrationCriticalRateLimit,
    commercialRegistrationApiGate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = verificationConfirmBodySchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({
            error: "invalid_request",
            message:
              'Se espera JSON { "intentPublicId": string (UUID), "code": string (6 dígitos) }.',
            details: parsed.error.flatten(),
          })
          return
        }

        const result = await registrationFlowService.submitVerificationCode(
          parsed.data.intentPublicId,
          parsed.data.code,
        )
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },
  )

  router.post(
    "/modality",
    commercialRegistrationApiGate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = setModalityBodySchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({
            error: "invalid_request",
            message:
              'Se espera JSON { "intentPublicId": string (UUID), "planTier"?: "free" | "team" | "pro", "modality"?: "individual" | "team" | "empresa", "billingCadence"?: "monthly", "teamSeatsPurchased"?: number }.',
            details: parsed.error.flatten(),
          })
          return
        }

        const planTier = parsed.data.planTier as CommercialPlanTier | undefined
        const modality =
          planTier !== undefined
            ? undefined
            : normalizeWorkspaceModality(parsed.data.modality ?? "team")
        if (planTier === undefined && !modality) {
          res.status(400).json({
            error: "invalid_request",
            message: "modalidad no válida",
          })
          return
        }

        const result = await registrationFlowService.setWorkspaceModality(
          parsed.data.intentPublicId,
          {
            modality,
            planTier,
            billingCadence: parsed.data.billingCadence ?? "monthly",
            teamSeatsRequested: parsed.data.teamSeatsPurchased,
          },
        )
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },
  )

  router.post(
    "/workspace-code-availability",
    commercialRegistrationApiGate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = workspaceCodeAvailabilityBodySchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({
            error: "invalid_request",
            message:
              'Se espera JSON { "code": string, "intentPublicId"?: string (UUID) }.',
            details: parsed.error.flatten(),
          })
          return
        }

        const result =
          await registrationFlowService.checkWorkspaceCodeAvailability(
            parsed.data.code,
            parsed.data.intentPublicId,
          )
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },
  )

  router.post(
    "/workspace-identity",
    commercialRegistrationApiGate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = workspaceIdentityBodySchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({
            error: "invalid_request",
            message:
              'Se espera JSON { "intentPublicId": string (UUID), "workspaceName": string, "workspaceCode": string }.',
            details: parsed.error.flatten(),
          })
          return
        }

        const result = await registrationFlowService.setWorkspaceIdentity(
          parsed.data.intentPublicId,
          parsed.data.workspaceName,
          parsed.data.workspaceCode,
        )
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },
  )

  router.post(
    "/account-credentials",
    registrationCriticalRateLimit,
    commercialRegistrationApiGate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = setAccountCredentialsBodySchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({
            error: "invalid_request",
            message:
              'Se espera JSON { "intentPublicId": string (UUID), "fullName": string, "password": string }.',
            details: parsed.error.flatten(),
          })
          return
        }

        const turnstileOk = await ensureTurnstileForRequest(
          req,
          res,
          parsed.data.turnstileToken,
        )
        if (!turnstileOk) return

        const result = await registrationFlowService.setAccountCredentials(
          parsed.data.intentPublicId,
          parsed.data.fullName,
          parsed.data.password,
        )
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },
  )

  router.post(
    "/payment/free-confirm",
    registrationCriticalRateLimit,
    commercialRegistrationApiGate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = confirmFreePlanPaymentBodySchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({
            error: "invalid_request",
            message: 'Se espera JSON { "intentPublicId": string (UUID) }.',
            details: parsed.error.flatten(),
          })
          return
        }

        const result = await registrationFlowService.confirmFreePlanPayment(
          parsed.data.intentPublicId,
        )
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },
  )

  router.post(
    "/payment/simulated-confirm",
    registrationCriticalRateLimit,
    commercialRegistrationApiGate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = confirmSimulatedPaymentBodySchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({
            error: "invalid_request",
            message:
              'Se espera JSON { "intentPublicId": string (UUID), "simulatedOutcome"?: "success" | "declined" | "provider_error" }.',
            details: parsed.error.flatten(),
          })
          return
        }

        const result = await registrationFlowService.confirmSimulatedPayment(
          parsed.data.intentPublicId,
          parsed.data.simulatedOutcome ?? "success",
        )
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },
  )

  router.post(
    "/payment/paddle-complete",
    registrationCriticalRateLimit,
    commercialRegistrationApiGate,
    createPaddleCompleteHandler(registrationFlowService),
  )

  /** Mismo contrato que `/payment/paddle-complete` (alias REST `payments`). */
  router.post(
    "/payments/paddle-complete",
    registrationCriticalRateLimit,
    commercialRegistrationApiGate,
    createPaddleCompleteHandler(registrationFlowService),
  )

  router.post(
    "/activate",
    registrationCriticalRateLimit,
    commercialRegistrationApiGate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = activateRegistrationBodySchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({
            error: "invalid_request",
            message:
              'Se espera JSON { "intentPublicId": string (UUID) }.',
            details: parsed.error.flatten(),
          })
          return
        }

        const turnstileOk = await ensureTurnstileForRequest(
          req,
          res,
          parsed.data.turnstileToken,
        )
        if (!turnstileOk) return

        const result = await registrationFlowService.activatePaidRegistration(
          parsed.data.intentPublicId,
        )
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },
  )

  return router
}
