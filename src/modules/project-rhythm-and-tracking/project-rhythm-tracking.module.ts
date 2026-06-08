import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { KanbanWipConfigService } from "../project-kanban-wip-limits/services/kanban-wip-config.service.js"
import type { KanbanMetricsService } from "../project-kanban-metrics/services/kanban-metrics.service.js"
import type { ScrumSprintPlanningRepository } from "../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ScrumBurndownVelocityService } from "../project-scrum-burndown-velocity/services/scrum-burndown-velocity.service.js"
import type { ImpedimentService } from "../project-impediments/services/impediment.service.js"
import type { FlowTimeService } from "../project-cycle-lead-time/services/flow-time.service.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceAuditLogRepository } from "../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import { createProjectRhythmTrackingRouter } from "./routes/project-rhythm-tracking.routes.js"
import {
  ProjectRhythmTrackingService,
  type ProjectRhythmTrackingServiceOptions,
} from "./services/project-rhythm-tracking.service.js"

export function createProjectRhythmTrackingService(
  projectRuntimeService: ProjectRuntimeService,
  sprintRepo: ScrumSprintPlanningRepository,
  burndownVelocity: ScrumBurndownVelocityService,
  flowTime: FlowTimeService,
  kanbanMetrics: KanbanMetricsService,
  kanbanWip: KanbanWipConfigService,
  impedimentService: ImpedimentService,
  auditLogRepository: WorkspaceAuditLogRepository | null,
  options?: Partial<ProjectRhythmTrackingServiceOptions>,
): ProjectRhythmTrackingService {
  const merged: ProjectRhythmTrackingServiceOptions = {
    auditLogAvailable: options?.auditLogAvailable ?? auditLogRepository != null,
  }
  return new ProjectRhythmTrackingService(
    projectRuntimeService,
    sprintRepo,
    burndownVelocity,
    flowTime,
    kanbanMetrics,
    kanbanWip,
    impedimentService,
    merged,
  )
}

export { ProjectRhythmTrackingService } from "./services/project-rhythm-tracking.service.js"

export type MountProjectRhythmTrackingModuleOptions = {
  rhythmTrackingService: ProjectRhythmTrackingService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

export function mountProjectRhythmTrackingModule(app: Express, options: MountProjectRhythmTrackingModuleOptions): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/rhythm-tracking",
    createProjectRhythmTrackingRouter(
      options.rhythmTrackingService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
