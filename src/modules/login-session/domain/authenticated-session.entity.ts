/**
 * Sesión persistida tras login exitoso (dominio). El token opaco **no** forma parte de la entidad persistida.
 */
export interface AuthenticatedSession {
  sessionPublicId: string
  userPublicId: string
  createdAt: Date
  expiresAt: Date
}
