import type { CommercialPlanTier } from "./commercial-pricing.constants.js"
import { maxActiveProjectsForPlanTier, maxUsersForPlanTier } from "./alinea-plan-catalog.js"
import { planTierFromPlanSku } from "./commercial-pricing.constants.js"
import type { WorkspaceModality } from "../registro-onboarding/domain/workspace-modality.js"

export class WorkspaceActiveProjectLimitError extends Error {
  readonly code = "workspace_active_project_limit_reached" as const
  readonly planTier: CommercialPlanTier
  readonly maxActiveProjects: number
  readonly currentActiveProjects: number

  constructor(input: {
    planTier: CommercialPlanTier
    maxActiveProjects: number
    currentActiveProjects: number
  }) {
    super(
      `Límite de proyectos activos alcanzado (${input.currentActiveProjects}/${input.maxActiveProjects}) para el plan ${input.planTier}.`,
    )
    this.name = "WorkspaceActiveProjectLimitError"
    this.planTier = input.planTier
    this.maxActiveProjects = input.maxActiveProjects
    this.currentActiveProjects = input.currentActiveProjects
  }
}

export function inferPlanTierFromWorkspaceContext(input: {
  planSku?: string | null
  modality: WorkspaceModality
  seatsPurchased: number
}): CommercialPlanTier {
  const fromSku = planTierFromPlanSku(input.planSku ?? undefined)
  if (fromSku) return fromSku

  if (input.modality === "individual" && input.seatsPurchased <= maxUsersForPlanTier("gratis")) {
    return "gratis"
  }

  return "estandar"
}

export function assertCanAddActiveProject(input: {
  planTier: CommercialPlanTier
  currentActiveProjects: number
}): void {
  const max = maxActiveProjectsForPlanTier(input.planTier)
  if (input.currentActiveProjects >= max) {
    throw new WorkspaceActiveProjectLimitError({
      planTier: input.planTier,
      maxActiveProjects: max,
      currentActiveProjects: input.currentActiveProjects,
    })
  }
}
