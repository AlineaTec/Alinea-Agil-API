import type { ScrumSprintState } from "../../project-scrum-sprint-planning/domain/scrum-sprint.js"
import { SPRINT_STATUSES_BLOCKING_OTHER_COMMITMENT } from "../../project-scrum-sprint-planning/domain/sprint-status.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import {
  emptyScrumCarryoverJsonFields,
  type ScrumCarryoverJsonFields,
} from "../domain/scrum-carryover-fields.js"

type LatestNotCompletedRef = {
  sprintPublicId: string
  sprintName: string
  closedAt: Date
}

function isValidClosedAt(d: unknown): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime())
}

/** Fila de snapshot usable para carryover: outcome explícito y id no vacío. */
function parseNotCompletedBacklogItemId(row: unknown): string | null {
  if (!row || typeof row !== "object") return null
  const r = row as Record<string, unknown>
  if (r.outcome !== "not_completed") return null
  const id = r.backlogItemPublicId
  if (typeof id !== "string" || !id.trim()) return null
  return id.trim()
}

function buildSprintMap(sprints: ScrumSprintState[]): Map<string, ScrumSprintState> {
  const m = new Map<string, ScrumSprintState>()
  for (const s of sprints) {
    m.set(s.sprintPublicId, s)
  }
  return m
}

/**
 * Para cada `backlogItemPublicId`, el cierre más reciente (por `closure.closedAt`)
 * donde aparece como `not_completed` en un sprint `closed` con snapshot coherente.
 */
function buildLatestNotCompletedByItemId(
  sprints: ScrumSprintState[],
): Map<string, LatestNotCompletedRef> {
  const byItem = new Map<string, LatestNotCompletedRef>()

  for (const sprint of sprints) {
    if (sprint.status !== "closed" || !sprint.closure) continue
    const { closure } = sprint
    if (!isValidClosedAt(closure.closedAt)) continue
    if (!Array.isArray(closure.items)) continue

    const closedAt = closure.closedAt
    const sprintPublicId = sprint.sprintPublicId
    const sprintName = typeof sprint.name === "string" ? sprint.name : ""

    for (const row of closure.items) {
      const backlogItemPublicId = parseNotCompletedBacklogItemId(row)
      if (!backlogItemPublicId) continue

      const prev = byItem.get(backlogItemPublicId)
      if (!prev || closedAt.getTime() > prev.closedAt.getTime()) {
        byItem.set(backlogItemPublicId, {
          sprintPublicId,
          sprintName,
          closedAt,
        })
      }
    }
  }

  return byItem
}

export class ScrumCarryoverDerivationService {
  constructor(private readonly sprintRepo: ScrumSprintPlanningRepository) {}

  /**
   * Derivación por lote. Usa listado de sprints del proyecto + membresías por ítem.
   */
  async deriveForBacklogItems(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicIds: string[],
  ): Promise<Map<string, ScrumCarryoverJsonFields>> {
    const uniqueIds = [...new Set(backlogItemPublicIds.filter((id) => typeof id === "string" && id))]
    const out = new Map<string, ScrumCarryoverJsonFields>()
    if (uniqueIds.length === 0) {
      return out
    }

    const sprints = await this.sprintRepo.listSprintsByProject(workspacePublicId, projectPublicId)
    const sprintById = buildSprintMap(sprints)
    const latestNotCompleted = buildLatestNotCompletedByItemId(sprints)

    for (const backlogItemPublicId of uniqueIds) {
      const ref = latestNotCompleted.get(backlogItemPublicId) ?? null
      const hasOpenCommitment = await this.itemHasBlockingSprintMembership(
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
        sprintById,
      )

      if (!ref) {
        out.set(backlogItemPublicId, emptyScrumCarryoverJsonFields())
        continue
      }

      const base: ScrumCarryoverJsonFields = {
        isCarryover: !hasOpenCommitment,
        lastNotCompletedSprintPublicId: ref.sprintPublicId,
        lastNotCompletedSprintName: ref.sprintName.trim() ? ref.sprintName : null,
        lastNotCompletedClosedAt: ref.closedAt.toISOString(),
      }
      out.set(backlogItemPublicId, base)
    }

    return out
  }

  private async itemHasBlockingSprintMembership(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    sprintById: Map<string, ScrumSprintState>,
  ): Promise<boolean> {
    const rows = await this.sprintRepo.listMembershipRowsForBacklogItemInProject(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    for (const row of rows) {
      const sprint = sprintById.get(row.sprintPublicId)
      if (sprint && SPRINT_STATUSES_BLOCKING_OTHER_COMMITMENT.has(sprint.status)) {
        return true
      }
    }
    return false
  }
}
