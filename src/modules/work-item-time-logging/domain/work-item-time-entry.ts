/**
 * Registro manual de minutos de trabajo asociado a un ítem (Scrum/Kanban, mismo almacenamiento de backlog).
 * `userPublicId` es quien reporta el esfuerzo (creador de la fila en v1; no se imputa al asignado).
 */
export type WorkItemTimeEntryState = {
  timeEntryPublicId: string
  workspacePublicId: string
  projectPublicId: string
  backlogItemPublicId: string
  userPublicId: string
  minutesSpent: number
  workDate: Date
  note: string | null
  createdAt: Date
  updatedAt: Date
  createdByUserPublicId: string
  updatedByUserPublicId: string
}

export type WorkItemTimeEntryListCursor = {
  createdAt: Date
  timeEntryPublicId: string
}

export type WorkItemTimeSummaryState = {
  workItemPublicId: string
  totalLoggedMinutes: number
  entryCount: number
  lastLoggedAt: Date | null
  lastTimeEntryByUserPublicId: string | null
}
