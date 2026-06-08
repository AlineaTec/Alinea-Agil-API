import type { AuthenticatedSession } from "../../domain/authenticated-session.entity.js"
import type { AuthSessionDocProps } from "../schemas/auth-session.schema.js"

export type AuthSessionPersisted = AuthSessionDocProps & {
  createdAt: Date
  updatedAt: Date
}

export function toAuthenticatedSession(doc: AuthSessionPersisted): AuthenticatedSession {
  return {
    sessionPublicId: doc.sessionPublicId,
    userPublicId: doc.userPublicId,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
  }
}
