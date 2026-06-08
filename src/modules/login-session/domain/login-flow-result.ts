import type { AuthenticatedSession } from "./authenticated-session.entity.js"
import type { LoginFailureReason } from "./login-failure-reason.js"

/**
 * Resultado del caso de uso email+contraseña (sin detalle HTTP).
 * En éxito incluye token opaco para el siguiente incremento (cabecera o cuerpo **[P]**).
 */
export type LoginFlowResult =
  | {
      ok: true
      session: AuthenticatedSession
      /** Secreto mostrado solo una vez en la respuesta de login; en BD se guarda su hash. */
      opaqueAccessToken: string
    }
  | {
      ok: false
      reason: LoginFailureReason
    }
