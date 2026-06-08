import type { WorkItemTimeEntryListCursor, WorkItemTimeEntryState, WorkItemTimeSummaryState } from "../domain/work-item-time-entry.js"

export type ListTimeEntriesPageInput = {
  workspacePublicId: string
  projectPublicId: string
  backlogItemPublicId: string
  limit: number
  after: WorkItemTimeEntryListCursor | null
}

export type UpdateTimeEntryInput = {
  workspacePublicId: string
  projectPublicId: string
  backlogItemPublicId: string
  timeEntryPublicId: string
  minutesSpent: number
  workDate: Date
  note: string | null
  updatedAt: Date
  updatedByUserPublicId: string
}

export type DeleteTimeEntryInput = {
  workspacePublicId: string
  projectPublicId: string
  backlogItemPublicId: string
  timeEntryPublicId: string
}

export type WorkItemTimeEntriesRepository = {
  insert(e: WorkItemTimeEntryState): Promise<void>
  findByIds(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    timeEntryPublicId: string,
  ): Promise<WorkItemTimeEntryState | null>
  listPage(input: ListTimeEntriesPageInput): Promise<WorkItemTimeEntryState[]>
  getSummaryForItem(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<WorkItemTimeSummaryState>
  update(input: UpdateTimeEntryInput): Promise<WorkItemTimeEntryState | null>
  delete(input: DeleteTimeEntryInput): Promise<boolean>
  /**
   * Suma minutos del usuario en el proyecto para entradas cuya `workDate` cumple `from <= workDate < toExclusive` (UTC).
   */
  sumMinutesForUserProjectWorkDateRange(
    workspacePublicId: string,
    projectPublicId: string,
    userPublicId: string,
    workDateFromInclusiveUtc: Date,
    workDateToExclusiveUtc: Date,
  ): Promise<number>
  /**
   * Suma minutos por usuario (solo `userPublicId` en `developerUserPublicIds`) en el rango de fechas de trabajo.
   */
  aggregateMinutesByDevelopersForProjectWorkDateRange(
    workspacePublicId: string,
    projectPublicId: string,
    developerUserPublicIds: string[],
    workDateFromInclusiveUtc: Date,
    workDateToExclusiveUtc: Date,
  ): Promise<{ userPublicId: string; totalMinutes: number }[]>
}
