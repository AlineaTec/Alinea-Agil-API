import type { PersistenceSession as ClientSession } from "../../../infrastructure/persistence/persistence-session.js"
import type { OperationalListCharterSnapshotDto } from "../../workspace-projects/domain/operational-list-charter-snapshot.js"
import { defaultInitialConfigurationSummary } from "../domain/initial-configuration-summary.js"
import type { InitialConfigurationSummary } from "../domain/initial-configuration-summary.js"
import { isOperationalApproach, type OperationalApproach } from "../domain/operational-approach.js"
import type { WorkspaceRuntimeProjectState } from "../domain/workspace-runtime-project.js"
import { ProjectRuntimeInvalidInputError, ProjectRuntimeNotFoundError } from "../domain/project-runtime.errors.js"
import { assertCanReadProjectRuntime } from "../policies/project-runtime-authorization.policy.js"
import { operationalProjectListingIsWorkspaceWide } from "../policies/operational-project-listing-scope.policy.js"
import type { ProjectRuntimeRepository } from "../persistence/project-runtime.repository.js"
import type { WorkTeamMembershipRepository } from "../../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkTeamProjectLinkRepository } from "../../workspace-work-teams/persistence/work-team-project-link.repository.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"

function isDuplicateKeyError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: number }).code === 11000
}

export type ProjectRuntimeSummaryDto = {
  projectPublicId: string
  workspacePublicId: string
  sourceDraftPublicId: string
  projectName: string
  operationalApproach: OperationalApproach
  initialConfigurationSummary: InitialConfigurationSummary
  /** Rellenado en null en el servicio; la ruta HTTP enriquece con el charter persistido. */
  charterSummary: OperationalListCharterSnapshotDto | null
  status: WorkspaceRuntimeProjectState["status"]
  materializedAt: string
  createdAt: string
  updatedAt: string
}

export type WorkspaceRuntimeProjectListItemDto = {
  projectPublicId: string
  workspacePublicId: string
  sourceDraftPublicId: string
  projectName: string
  operationalApproach: OperationalApproach
  /** Misma forma que en el summary: piezas de configuración operativa reconocidas. */
  initialConfigurationSummary: InitialConfigurationSummary
  /** Extracto del charter del borrador origen; la ruta puede enriquecer tras leer borradores. */
  charterSummary: OperationalListCharterSnapshotDto | null
  status: WorkspaceRuntimeProjectState["status"]
  materializedAt: string
  createdAt: string
  updatedAt: string
}

function stateToListItemDto(state: WorkspaceRuntimeProjectState): WorkspaceRuntimeProjectListItemDto {
  return {
    projectPublicId: state.projectPublicId,
    workspacePublicId: state.workspacePublicId,
    sourceDraftPublicId: state.sourceDraftPublicId,
    projectName: state.projectName,
    operationalApproach: state.operationalApproach,
    initialConfigurationSummary: state.initialConfigurationSummary,
    charterSummary: null,
    status: state.status,
    materializedAt: state.materializedAt.toISOString(),
    createdAt: state.createdAt.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
  }
}

function stateToSummaryDto(state: WorkspaceRuntimeProjectState): ProjectRuntimeSummaryDto {
  return {
    projectPublicId: state.projectPublicId,
    workspacePublicId: state.workspacePublicId,
    sourceDraftPublicId: state.sourceDraftPublicId,
    projectName: state.projectName,
    operationalApproach: state.operationalApproach,
    initialConfigurationSummary: state.initialConfigurationSummary,
    charterSummary: null,
    status: state.status,
    materializedAt: state.materializedAt.toISOString(),
    createdAt: state.createdAt.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
  }
}

export class ProjectRuntimeService {
  constructor(
    private readonly repo: ProjectRuntimeRepository,
    private readonly workTeamMembershipRepository: WorkTeamMembershipRepository,
    private readonly workTeamProjectLinkRepository: WorkTeamProjectLinkRepository,
  ) {}

  /**
   * Estado operativo sin policy HTTP propia — usar solo tras comprobar permisos en el caller
   * (p. ej. `project-rhythm-and-tracking`).
   */
  async findWorkspaceRuntimeProjectState(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<WorkspaceRuntimeProjectState | null> {
    const row = await this.repo.findByWorkspaceAndProjectPublicId(workspacePublicId, projectPublicId)
    if (!row) return null
    if (row.workspacePublicId !== workspacePublicId) return null
    return row
  }

  async findByWorkspaceAndSourceDraftPublicId(
    workspacePublicId: string,
    sourceDraftPublicId: string,
    session?: ClientSession,
  ): Promise<WorkspaceRuntimeProjectState | null> {
    return this.repo.findByWorkspaceAndSourceDraftPublicId(
      workspacePublicId,
      sourceDraftPublicId,
      session,
    )
  }

  private async teamLinkedProjectPublicIdSet(
    workspacePublicId: string,
    userPublicId: string,
  ): Promise<Set<string>> {
    const teamIds = await this.workTeamMembershipRepository.listActiveTeamPublicIdsForUserInWorkspace(
      workspacePublicId,
      userPublicId,
    )
    if (teamIds.length === 0) {
      return new Set()
    }
    const projectIds = await this.workTeamProjectLinkRepository.listDistinctProjectPublicIdsForTeams(
      workspacePublicId,
      teamIds,
    )
    return new Set(projectIds)
  }

  /**
   * Listado de proyectos operativos del workspace.
   * `charterSummary` se rellena en null aquí; la ruta HTTP enriquece con el borrador origen.
   * Roles no workspace-wide solo ven proyectos vinculados a equipos donde el actor es miembro activo.
   */
  async listWorkspaceRuntimeProjectsForWorkspace(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
  ): Promise<WorkspaceRuntimeProjectListItemDto[]> {
    assertCanReadProjectRuntime(actor)
    const rows = await this.repo.listByWorkspacePublicId(workspacePublicId)
    if (operationalProjectListingIsWorkspaceWide(actor)) {
      return rows.map(stateToListItemDto)
    }
    const allowed = await this.teamLinkedProjectPublicIdSet(workspacePublicId, actor.userPublicId)
    return rows.filter((r) => allowed.has(r.projectPublicId)).map(stateToListItemDto)
  }

  /**
   * Submódulos operativos (p. ej. Scrum backlog): proyecto debe existir y ser **scrum**.
   */
  async requireScrumWorkspaceRuntimeProject(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<WorkspaceRuntimeProjectState> {
    const row = await this.repo.findByWorkspaceAndProjectPublicId(workspacePublicId, projectPublicId)
    if (!row) {
      throw new ProjectRuntimeNotFoundError()
    }
    if (row.operationalApproach !== "scrum") {
      throw new ProjectRuntimeInvalidInputError(
        "This resource only applies to operational projects with approach scrum.",
      )
    }
    return row
  }

  /**
   * Submódulos operativos Kanban: proyecto debe existir y ser **kanban**.
   */
  async requireKanbanWorkspaceRuntimeProject(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<WorkspaceRuntimeProjectState> {
    const row = await this.repo.findByWorkspaceAndProjectPublicId(workspacePublicId, projectPublicId)
    if (!row) {
      throw new ProjectRuntimeNotFoundError()
    }
    if (row.operationalApproach !== "kanban") {
      throw new ProjectRuntimeInvalidInputError(
        "This resource only applies to operational projects with approach kanban.",
      )
    }
    return row
  }

  /**
   * Transversal work-item (comentarios, asignación): proyecto Scrum o Kanban operativo.
   */
  async requireScrumOrKanbanWorkspaceRuntimeProject(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<WorkspaceRuntimeProjectState> {
    const row = await this.repo.findByWorkspaceAndProjectPublicId(workspacePublicId, projectPublicId)
    if (!row) {
      throw new ProjectRuntimeNotFoundError()
    }
    if (row.operationalApproach !== "scrum" && row.operationalApproach !== "kanban") {
      throw new ProjectRuntimeInvalidInputError(
        "This resource only applies to operational projects with approach scrum or kanban.",
      )
    }
    return row
  }

  /**
   * Resumen HTTP para la home del proyecto operativo.
   */
  /**
   * Tras editar el charter de un borrador `materialized`, mantiene alineado el nombre del proyecto operativo.
   */
  async updateProjectNameForSourceDraft(
    workspacePublicId: string,
    sourceDraftPublicId: string,
    projectName: string,
  ): Promise<void> {
    const row = await this.repo.findByWorkspaceAndSourceDraftPublicId(
      workspacePublicId,
      sourceDraftPublicId,
    )
    if (!row) {
      return
    }
    const trimmed = projectName.trim().slice(0, 500) || "Sin nombre"
    if (row.projectName === trimmed) {
      return
    }
    await this.repo.updateProjectNameByWorkspaceAndSourceDraft(
      workspacePublicId,
      sourceDraftPublicId,
      trimmed,
    )
  }

  async getProjectRuntimeSummary(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<ProjectRuntimeSummaryDto> {
    assertCanReadProjectRuntime(actor)

    const row = await this.repo.findByWorkspaceAndProjectPublicId(workspacePublicId, projectPublicId)
    if (!row) {
      throw new ProjectRuntimeNotFoundError()
    }

    if (row.workspacePublicId !== workspacePublicId) {
      throw new ProjectRuntimeNotFoundError()
    }

    if (!operationalProjectListingIsWorkspaceWide(actor)) {
      const allowed = await this.teamLinkedProjectPublicIdSet(workspacePublicId, actor.userPublicId)
      if (!allowed.has(projectPublicId)) {
        throw new ProjectRuntimeNotFoundError()
      }
    }

    return stateToSummaryDto(row)
  }

  /**
   * Persiste el contenedor operativo tras materialización del draft.
   * Idempotente frente a carrera en el índice único `(workspacePublicId, sourceDraftPublicId)`:
   * si ya existe fila para ese draft, devuelve el estado existente (el caller debe alinear el draft con `projectPublicId` devuelto).
   */
  async createWorkspaceRuntimeProjectFromMaterialization(
    input: {
      workspacePublicId: string
      projectPublicId: string
      sourceDraftPublicId: string
      projectName: string
      operationalApproach: string
      initialConfigurationSummary?: InitialConfigurationSummary
    },
    session?: ClientSession,
  ): Promise<WorkspaceRuntimeProjectState> {
    if (!isOperationalApproach(input.operationalApproach)) {
      throw new ProjectRuntimeInvalidInputError(
        `operationalApproach must be scrum, kanban, or predictive_phases; got ${input.operationalApproach}`,
      )
    }

    const approach = input.operationalApproach
    const now = new Date()
    const summary = input.initialConfigurationSummary ?? defaultInitialConfigurationSummary(approach)

    const state: WorkspaceRuntimeProjectState = {
      projectPublicId: input.projectPublicId,
      workspacePublicId: input.workspacePublicId,
      sourceDraftPublicId: input.sourceDraftPublicId,
      projectName: input.projectName.trim().slice(0, 500) || "Sin nombre",
      operationalApproach: approach,
      initialConfigurationSummary: summary,
      status: "active",
      materializedAt: now,
      createdAt: now,
      updatedAt: now,
    }

    try {
      await this.repo.insert(state, session)
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        const existing = await this.repo.findByWorkspaceAndSourceDraftPublicId(
          input.workspacePublicId,
          input.sourceDraftPublicId,
          session,
        )
        if (existing) {
          return existing
        }
      }
      throw e
    }

    const persisted = await this.repo.findByWorkspaceAndProjectPublicId(
      input.workspacePublicId,
      input.projectPublicId,
      session,
    )
    if (!persisted) {
      throw new Error("project_runtime_insert_missing_after_create")
    }
    return persisted
  }
}
