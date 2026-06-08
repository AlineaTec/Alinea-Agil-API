export interface ProjectScrumSprintAssignmentDocProps {
  sprintPublicId: string
  backlogItemPublicId: string
  workspacePublicId: string
  projectPublicId: string
  sprintSortOrder: number
  committedAt: Date
  committedByUserPublicId: string
  boardColumn?: string | null
}
