/**
 * Contrato para enforcement de expansión de usuarios efectivos con asiento (**workspace-users**).
 * Implementación típica: `createWorkspaceSeatExpansionGate` en este módulo.
 */
export interface WorkspaceSeatExpansionGate {
  assertCanExpandSeatConsumption(workspacePublicId: string): Promise<void>
}
