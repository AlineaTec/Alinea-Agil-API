import type { PersistenceSession as ClientSession } from "../../../infrastructure/persistence/persistence-session.js"
import type { PlatformTenantState } from "../domain/platform-tenant.entity.js"

export interface PlatformTenantRepository {
  insert(state: PlatformTenantState, session?: ClientSession): Promise<void>
  save(state: PlatformTenantState, session?: ClientSession): Promise<void>
  findByPlatformTenantId(
    platformTenantId: string,
    session?: ClientSession,
  ): Promise<PlatformTenantState | null>
  findByWorkspacePublicId(
    workspacePublicId: string,
    session?: ClientSession,
  ): Promise<PlatformTenantState | null>
  findByWorkspacePublicIds(
    workspacePublicIds: string[],
    session?: ClientSession,
  ): Promise<Map<string, PlatformTenantState>>
  /** Crea filas faltantes para los workspaces indicados (idempotente). */
  ensureForWorkspacePublicIds(
    workspacePublicIds: string[],
    session?: ClientSession,
  ): Promise<Map<string, PlatformTenantState>>
}
