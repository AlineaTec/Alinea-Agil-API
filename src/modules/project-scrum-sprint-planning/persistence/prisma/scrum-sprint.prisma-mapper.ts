import { Prisma, type Sprint } from "@prisma/client"
import type { ScrumSprintState } from "../../domain/scrum-sprint.js"
import { docToScrumSprintState } from "../mappers/scrum-sprint.mapper.js"
import type { ScrumSprintDocProps } from "../schemas/scrum-sprint.schema.js"

export function sprintRowToDocProps(row: Sprint): ScrumSprintDocProps {
  return {
    sprintPublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    name: row.name,
    goal: row.goal,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    createdByUserPublicId: row.created_by_user_public_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closure: row.closure as ScrumSprintDocProps["closure"],
    review: row.review as ScrumSprintDocProps["review"],
    retrospective: row.retrospective as ScrumSprintDocProps["retrospective"],
  }
}

export function sprintRowToState(row: Sprint): ScrumSprintState {
  return docToScrumSprintState(sprintRowToDocProps(row))
}

export function sprintStateToCreate(
  state: ScrumSprintState,
  ids: { workspaceId: string; projectId: string },
): Prisma.SprintUncheckedCreateInput {
  return {
    public_id: state.sprintPublicId,
    workspace_id: ids.workspaceId,
    workspace_public_id: state.workspacePublicId,
    project_id: ids.projectId,
    project_public_id: state.projectPublicId,
    name: state.name,
    goal: state.goal,
    status: state.status,
    start_date: state.startDate,
    end_date: state.endDate,
    created_by_user_public_id: state.createdByUserPublicId,
    closure: state.closure ? (state.closure as Prisma.InputJsonValue) : undefined,
    review: state.review ? (state.review as Prisma.InputJsonValue) : undefined,
    retrospective: state.retrospective ? (state.retrospective as Prisma.InputJsonValue) : undefined,
    created_at: state.createdAt,
    updated_at: state.updatedAt,
  }
}

export function sprintStateToUpdateData(state: ScrumSprintState): Prisma.SprintUncheckedUpdateManyInput {
  return {
    name: state.name,
    goal: state.goal,
    status: state.status,
    start_date: state.startDate,
    end_date: state.endDate,
    updated_at: state.updatedAt,
    closure: state.closure
      ? (state.closure as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    review: state.review ? (state.review as Prisma.InputJsonValue) : Prisma.JsonNull,
    retrospective: state.retrospective
      ? (state.retrospective as Prisma.InputJsonValue)
      : Prisma.JsonNull,
  }
}
