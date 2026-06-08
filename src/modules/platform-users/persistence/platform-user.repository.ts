import type { PersistenceSession as ClientSession } from "../../../infrastructure/persistence/persistence-session.js"
import type { PlatformRole } from "../domain/platform-role.js"
import type { PlatformUserState } from "../domain/platform-user.entity.js"

export interface PlatformUserRepository {
  insert(state: PlatformUserState, session?: ClientSession): Promise<void>
  save(state: PlatformUserState, session?: ClientSession): Promise<void>
  findById(platformUserId: string, session?: ClientSession): Promise<PlatformUserState | null>
  findByEmail(email: string, session?: ClientSession): Promise<PlatformUserState | null>
  listAll(session?: ClientSession): Promise<PlatformUserState[]>
  countActiveByRole(role: PlatformRole, session?: ClientSession): Promise<number>
  countAll(session?: ClientSession): Promise<number>
}
