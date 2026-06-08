import type { WorkControlOverrideTokenState } from "./work-controls.persistence-mapper.js"

export type WorkControlOverrideTokenRepository = {
  findOne(
    overrideTokenPublicId: string,
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<WorkControlOverrideTokenState | null>
  create(state: WorkControlOverrideTokenState): Promise<void>
  markConsumed(overrideTokenPublicId: string, consumedAt: Date): Promise<boolean>
}
