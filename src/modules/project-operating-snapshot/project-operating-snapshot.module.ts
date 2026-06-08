import type { Express, RequestHandler } from "express"
import type { RuntimePersistence } from "../../composition/runtime-persistence.js"
import {
  operatingSnapshotRuntimeSourcesFrom,
  type OperatingSnapshotRuntimeSources,
} from "../../composition/operating-snapshot-runtime-sources.js"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import { createOperatingSnapshotRouter } from "./routes/operating-snapshot.routes.js"
import type { OperatingSnapshotNbaSnoozeRepository } from "./persistence/operating-snapshot-nba-snooze.repository.js"
import { OperatingSnapshotService } from "./services/operating-snapshot.service.js"
import { OperatingSnapshotCache } from "./services/operating-snapshot-cache.js"

const sharedSnapshotCache = new OperatingSnapshotCache()

export type CreateOperatingSnapshotServiceOptions = {
  /** Fuentes por dominio; por defecto se derivan de `runtimePersistence`. */
  sources?: OperatingSnapshotRuntimeSources
  /** NBA snooze; por defecto `runtimePersistence.operatingConsumers.nbaSnooze`. */
  nbaSnooze?: OperatingSnapshotNbaSnoozeRepository
  cache?: OperatingSnapshotCache
}

/**
 * Snapshot operativo: dominios fuente y NBA snooze desde `runtimePersistence`.
 * `projectRuntime` ya debe estar cableado con projects/workspace del mismo runtime.
 */
export function createOperatingSnapshotService(
  projectRuntime: ProjectRuntimeService,
  runtimePersistence: RuntimePersistence,
  options?: CreateOperatingSnapshotServiceOptions,
): OperatingSnapshotService {
  const sources = options?.sources ?? operatingSnapshotRuntimeSourcesFrom(runtimePersistence)
  const snooze = options?.nbaSnooze ?? runtimePersistence.operatingConsumers.nbaSnooze
  const cache = options?.cache ?? sharedSnapshotCache
  return new OperatingSnapshotService(
    projectRuntime,
    sources.sprintPlanning,
    sources.planningSession,
    sources.refinementSession,
    sources.refinementReviewedItem,
    sources.dailySession,
    sources.reviewSession,
    sources.retroSession,
    sources.retroActionItem,
    sources.impediments,
    snooze,
    cache,
  )
}

export { OperatingSnapshotService } from "./services/operating-snapshot.service.js"
export { OperatingSnapshotCache } from "./services/operating-snapshot-cache.js"
export type { OperatingSnapshotRuntimeSources } from "../../composition/operating-snapshot-runtime-sources.js"

export type MountOperatingSnapshotModuleOptions = {
  operatingSnapshotService: OperatingSnapshotService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

/**
 * Rutas bajo
 * `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/operating-snapshot`.
 */
export function mountOperatingSnapshotModule(app: Express, options: MountOperatingSnapshotModuleOptions): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/operating-snapshot",
    createOperatingSnapshotRouter(
      options.operatingSnapshotService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
