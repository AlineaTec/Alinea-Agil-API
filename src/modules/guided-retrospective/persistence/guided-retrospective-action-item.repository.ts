import type {
  GuidedRetrospectiveActionItemHistoryEntry,
  GuidedRetrospectiveActionItemState,
} from "../domain/guided-retrospective-action-item.js"

export type GuidedRetrospectiveActionItemRepository = {
  listBySession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedRetrospectiveActionItemState[]>
  replaceAllForSession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    rows: GuidedRetrospectiveActionItemState[],
  ): Promise<void>
  listByProject(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<GuidedRetrospectiveActionItemState[]>
  findByPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    actionItemPublicId: string,
  ): Promise<GuidedRetrospectiveActionItemState | null>
  applyPatchWithHistory(
    workspacePublicId: string,
    projectPublicId: string,
    actionItemPublicId: string,
    fields: Partial<
      Pick<
        GuidedRetrospectiveActionItemState,
        "title" | "description" | "ownerUserPublicId" | "dueDate" | "priority" | "status"
      >
    >,
    newHistory: GuidedRetrospectiveActionItemHistoryEntry[],
    updatedAt: Date,
  ): Promise<GuidedRetrospectiveActionItemState | null>
}
