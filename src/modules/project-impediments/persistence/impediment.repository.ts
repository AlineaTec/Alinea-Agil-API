import type { ImpedimentSeverity, ImpedimentState, ImpedimentStatus } from "../domain/impediment.js"

export type ImpedimentListFilters = {
  status?: ImpedimentStatus | ImpedimentStatus[]
  severity?: ImpedimentSeverity
  responsibleUserPublicId?: string
  relatedWorkItemPublicId?: string
  relatedSprintPublicId?: string
}

export type ImpedimentListResult = {
  items: ImpedimentState[]
  totalCount: number
}

export interface ImpedimentRepository {
  insert(state: ImpedimentState): Promise<void>
  replace(state: ImpedimentState): Promise<void>
  findByProjectAndId(
    workspacePublicId: string,
    projectPublicId: string,
    impedimentPublicId: string,
  ): Promise<ImpedimentState | null>
  listByProject(
    workspacePublicId: string,
    projectPublicId: string,
    filters: ImpedimentListFilters,
    pagination: { limit: number; offset: number },
  ): Promise<ImpedimentListResult>
}
