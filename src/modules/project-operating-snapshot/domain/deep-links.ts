const APP_PREFIX = "/app/workspace/projects/runtime"

export function projectRuntimeBase(projectPublicId: string): string {
  return `${APP_PREFIX}/${projectPublicId}`
}

export function deepLinkDaily(projectPublicId: string): string {
  return `${projectRuntimeBase(projectPublicId)}/daily-alignment`
}

export function deepLinkRefinement(projectPublicId: string): string {
  return `${projectRuntimeBase(projectPublicId)}/guided-refinement`
}

export function deepLinkPlanning(projectPublicId: string): string {
  return `${projectRuntimeBase(projectPublicId)}/guided-sprint-planning`
}

export function deepLinkReview(projectPublicId: string): string {
  return `${projectRuntimeBase(projectPublicId)}/guided-review`
}

export function deepLinkRetro(projectPublicId: string): string {
  return `${projectRuntimeBase(projectPublicId)}/guided-retrospective`
}

export function deepLinkRetroActions(projectPublicId: string): string {
  return `${projectRuntimeBase(projectPublicId)}/guided-retrospective/actions`
}

export function deepLinkScrumSprints(projectPublicId: string): string {
  return `${projectRuntimeBase(projectPublicId)}/scrum-sprints`
}

export function deepLinkScrumBoard(projectPublicId: string, sprintPublicId: string): string {
  return `${projectRuntimeBase(projectPublicId)}/scrum-sprints/${sprintPublicId}/board`
}

export function deepLinkKanbanBoard(projectPublicId: string): string {
  return `${projectRuntimeBase(projectPublicId)}/kanban-board`
}

export function deepLinkBacklog(projectPublicId: string, approach: "scrum" | "kanban"): string {
  return approach === "scrum"
    ? `${projectRuntimeBase(projectPublicId)}/scrum-backlog`
    : `${projectRuntimeBase(projectPublicId)}/kanban-backlog`
}

export function deepLinkImpediments(projectPublicId: string): string {
  return `${projectRuntimeBase(projectPublicId)}/impediments`
}

export function deepLinkInsights(projectPublicId: string): string {
  return `${projectRuntimeBase(projectPublicId)}/report`
}

export function deepLinkProjectHome(projectPublicId: string): string {
  return `${projectRuntimeBase(projectPublicId)}`
}
