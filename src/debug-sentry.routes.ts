import express, { type Express } from "express"
import * as Sentry from "@sentry/node"

function isSentryDebugRoutesEnabled(): boolean {
  const v = process.env.SENTRY_DEBUG_ROUTES?.trim().toLowerCase()
  return v === "true" || v === "1" || v === "yes"
}

/**
 * Rutas para verificar la integración con Sentry. Solo activas si
 * `SENTRY_DEBUG_ROUTES` es `true`, `1` o `yes` (nunca en producción).
 * Si está desactivado, `/debug/sentry/*` responde JSON 403 explicando el motivo
 * (evita el HTML «Cannot GET» de Express).
 */
export function mountDebugSentryRoutesIfEnabled(app: Express): void {
  if (!isSentryDebugRoutesEnabled()) {
    const r = express.Router()
    r.use((_req, res) => {
      res.status(403).json({
        ok: false,
        code: "sentry_debug_routes_disabled",
        message:
          "Activa SENTRY_DEBUG_ROUTES=true (o 1 / yes) en el .env del API y reinicia el servidor.",
        sentrySdkEnabled: Sentry.isEnabled(),
      })
    })
    app.use("/debug/sentry", r)
    return
  }

  app.get("/debug/sentry/throw", (_req, _res, next) => {
    next(new Error("Sentry test: error vía next() (ruta /debug/sentry/throw)"))
  })

  app.get("/debug/sentry/capture", (_req, res) => {
    Sentry.captureException(
      new Error("Sentry test: captureException explícito (ruta /debug/sentry/capture)"),
    )
    res.status(202).json({
      ok: true,
      sentryEnabled: Sentry.isEnabled(),
      detail:
        "Se envió un evento con captureException; HTTP 202 para no confundir con fallo real del cliente.",
    })
  })

  app.get("/debug/sentry/message", (_req, res) => {
    Sentry.captureMessage(
      "Sentry test: captureMessage warning (ruta /debug/sentry/message)",
      "warning",
    )
    res.status(202).json({
      ok: true,
      sentryEnabled: Sentry.isEnabled(),
      detail: "Se envió un mensaje nivel warning a Sentry.",
    })
  })
}
