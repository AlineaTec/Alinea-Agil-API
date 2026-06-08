export type KanbanFlowDocProps = {
  workspacePublicId: string
  projectPublicId: string
  entryColumnPublicId: string
  columns: {
    columnPublicId: string
    name: string
    position: number
    wipLimit: number | null
    policyText: string
    wipEnforcement?: "informational" | "warning" | "blocking"
  }[]
  wipNearThresholdRatio?: number
}
