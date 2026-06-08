/**
 * Uso único, corta duración, para reintentar transición con bloqueo (OQ-02).
 */
export interface WorkControlOverrideTokenDocProps {
  overrideTokenPublicId: string
  workspacePublicId: string
  projectPublicId: string
  workItemPublicId: string
  eventCode: string
  actorUserPublicId: string
  reason: string
  createdAt: Date
  expiresAt: Date
  consumedAt: Date | null
}
