import type { AuthenticatedSession } from "../domain/authenticated-session.entity.js"
import type { LoginFailureReason } from "../domain/login-failure-reason.js"

/** Cuerpo tentativo POST `/v1/auth/login` (OP-L1); formalizar con OpenAPI **[P]**. */
export type LoginEmailPasswordRequestBody = {
  email: string
  password: string
}

/** Respuesta de éxito tentativa; mecanismo de entrega del token **[P]**. */
export type LoginSuccessResponseDto = {
  ok: true
  session: AuthenticatedSession
  accessToken: string
}

export type LoginFailureResponseDto = {
  ok: false
  reason: LoginFailureReason
}

export type LoginResponseDto = LoginSuccessResponseDto | LoginFailureResponseDto
