import { Router, type Request, type RequestHandler, type Response, type NextFunction } from "express"
import { commercialRegistrationApiGate } from "../../../config/payment-gateway-policy.js"
import { ensureTurnstileForRequest } from "../../../infra/turnstile/ensure-turnstile-for-request.js"
import { computeCommercialQuote } from "../../commercial-pricing/compute-commercial-quote.js"
import {
  buildPaddleSubscriptionCheckoutLines,
  presentPaddleCheckoutLines,
} from "../../commercial-pricing/paddle-checkout-lines.js"
import { loadPaddlePriceCatalogFromEnv } from "../../commercial-pricing/paddle-price-catalog.js"
import {
  ADDITIONAL_SEAT_MONTHLY_USD,
  ALINEA_PLAN_TIERS,
  COMMERCIAL_CURRENCY,
  COMMERCIAL_PLAN_TIERS,
  GRATIS_TIER_MAX_ACTIVE_PROJECTS,
  GRATIS_TIER_MAX_SEATS,
  INDIVIDUAL_MONTHLY_USD,
  PAID_TIER_MIN_LICENSES,
  PROFESIONAL_TIER_LICENSE_MONTHLY_USD,
  TEAM_BASE_MONTHLY_USD,
  TEAM_MIN_SEATS,
  TEAM_SEAT_MONTHLY_USD,
  ESTANDAR_TIER_LICENSE_MONTHLY_USD,
} from "../../commercial-pricing/commercial-pricing.constants.js"
import { normalizeWorkspaceModality } from "../domain/workspace-modality.js"
import type { CommercialPlanTier } from "../../commercial-pricing/commercial-pricing.constants.js"
import type { RegistrationFlowService } from "../services/registration-flow.service.js"
import {
  activateRegistrationBodySchema,
  commercialQuoteBodySchema,
  paddleCheckoutLinesBodySchema,
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
        planTiers: COMMERCIAL_PLAN_TIERS.map((id) => ({
          id,
          pricePerLicenseMonthlyUsd: ALINEA_PLAN_TIERS[id].pricePerLicenseMonthlyUsd,
          minLicenses: ALINEA_PLAN_TIERS[id].minLicenses,
          maxUsers: ALINEA_PLAN_TIERS[id].maxUsers,
          maxActiveProjects: ALINEA_PLAN_TIERS[id].maxActiveProjects,
        })),
        freeTierMaxSeats: GRATIS_TIER_MAX_SEATS,
        freeTierMaxActiveProjects: GRATIS_TIER_MAX_ACTIVE_PROJECTS,
        teamTierLicenseMonthlyUsd: ESTANDAR_TIER_LICENSE_MONTHLY_USD,
        proTierLicenseMonthlyUsd: PROFESIONAL_TIER_LICENSE_MONTHLY_USD,
        paidTierMinLicenses: PAID_TIER_MIN_LICENSES,
        /** @deprecated Modelo Paddle legado — preferir `planTiers`. */
        individualMonthlyUsd: INDIVIDUAL_MONTHLY_USD,
        teamBaseMonthlyUsd: TEAM_BASE_MONTHLY_USD,
        additionalSeatMonthlyUsd: ADDITIONAL_SEAT_MONTHLY_USD,
        teamSeatMonthlyUsd: TEAM_SEAT_MONTHLY_USD,
        teamMinSeats: TEAM_MIN_SEATS,
        teamIncludedSeats: TEAM_MIN_SEATS,
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
              'Se espera JSON { "planTier"?: "gratis" | "estandar" | "profesional", "modality"?: "individual" | "team" | "empresa", "billingCadence": "monthly", "teamSeatsPurchased"?: number }.',
            details: parsed.error.flatten(),
          })
          return
        }
        const planTier = parsed.data.planTier as CommercialPlanTier | undefined
        const modality =
          planTier !== undefined
            ? planTier === "gratis"
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
    "/paddle-checkout-lines",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = paddleCheckoutLinesBodySchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({
            error: "invalid_request",
            message:
              'Se espera JSON { "planTier"?: "gratis" | "estandar" | "profesional", "modality"?: "individual" | "team" | "empresa", "billingCadence": "monthly", "teamSeatsPurchased"?: number }.',
            details: parsed.error.flatten(),
          })
          return
        }

        const catalog = loadPaddlePriceCatalogFromEnv()
        if (!catalog) {
          res.status(503).json({
            error: "commercial_catalog_not_configured",
            message:
              "Catálogo Paddle no configurado. Define PADDLE_PRICE_ESTANDAR_LICENSE_MONTHLY y PADDLE_PRICE_PROFESIONAL_LICENSE_MONTHLY (o el modelo legado base+addon).",
          })
          return
        }

        const planTier = parsed.data.planTier as CommercialPlanTier | undefined
        const modality =
          planTier !== undefined
            ? planTier === "gratis"
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

        const built = buildPaddleSubscriptionCheckoutLines({
          plan: modality,
          billingCadence: parsed.data.billingCadence,
          teamSeatsRequested:
            modality === "team" ? parsed.data.teamSeatsPurchased : undefined,
          planTier,
          catalog,
        })

        if (!built.ok) {
          const message =
            built.reason === "tier_required"
              ? "Para el catálogo por licencia se requiere planTier estandar o profesional."
              : built.reason === "empty_catalog"
                ? "No se pudieron resolver price_id para este checkout."
                : "No se pudo construir el checkout Paddle."
          res.status(400).json({ error: built.reason, message })
          return
        }

        res.status(200).json({
          quote,
          lines: presentPaddleCheckoutLines(built.lines, catalog),
        })
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
              'Se espera JSON { "intentPublicId": string (UUID), "planTier"?: "gratis" | "estandar" | "profesional", "modality"?: "individual" | "team" | "empresa", "billingCadence"?: "monthly", "teamSeatsPurchased"?: number }.',
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
