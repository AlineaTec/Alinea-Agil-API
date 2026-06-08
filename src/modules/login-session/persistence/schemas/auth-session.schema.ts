/**
 * Sesión de autenticación persistida (OP-L1). Token opaco no se guarda en claro.
 * Logout / revocación global **[P]**.
 */
export interface AuthSessionDocProps {
  sessionPublicId: string
  userPublicId: string
  tokenHash: string
  expiresAt: Date
}
