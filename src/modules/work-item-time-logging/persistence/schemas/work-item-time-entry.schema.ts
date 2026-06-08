export interface WorkItemTimeEntryDocProps {
  timeEntryPublicId: string
  workspacePublicId: string
  projectPublicId: string
  backlogItemPublicId: string
  userPublicId: string
  minutesSpent: number
  workDate: Date
  note: string | null
  createdByUserPublicId: string
  updatedByUserPublicId: string
  createdAt: Date
  updatedAt: Date
}
