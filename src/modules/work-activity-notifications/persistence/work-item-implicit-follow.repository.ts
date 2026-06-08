export interface WorkItemImplicitFollowRepository {
  touch(input: {
    workspacePublicId: string
    userPublicId: string
    backlogItemPublicId: string
    at: Date
  }): Promise<void>
  listUserIdsFollowingItem(input: {
    workspacePublicId: string
    backlogItemPublicId: string
    now: Date
  }): Promise<string[]>
}
