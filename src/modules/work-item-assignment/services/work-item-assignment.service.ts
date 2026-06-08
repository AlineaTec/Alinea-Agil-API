import { randomUUID } from "node:crypto"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import { isProjectWorkAssignableItemType } from "../domain/assignable-work-item-type.js"
import type { WorkItemAssignmentChangeType } from "../domain/work-item-assignment-change-type.js"
import type { WorkItemAssignmentHistoryEvent } from "../domain/work-item-assignment-history-event.js"
import {
  WorkItemAssignmentConflictError,
  WorkItemAssignmentNotFoundError,
  WorkItemAssignmentValidationError,
} from "../domain/work-item-assignment.errors.js"
import { ProjectWorkAssignmentError } from "../domain/project-work-assignment.errors.js"
import {
  assertCanCoordinateWorkItemAssignment,
  assertCanReadWorkItemAssignment,
  assertCanSelfAssignWorkItem,
  isWorkItemAssignmentCoordinator,
} from "../policies/work-item-assignment-authorization.policy.js"
import { ProjectAssignableUsersService } from "./project-assignable-users.service.js"
import type { WorkActivityNotificationFanoutService } from "../../work-activity-notifications/services/work-activity-notification-fanout.service.js"

export type WorkItemAssignmentSnapshot = {
  assignedUserPublicId: string | null
  assignmentUpdatedAt: Date | null
  assignmentUpdatedByUserPublicId: string | null
}

export class WorkItemAssignmentService {
  constructor(
    private readonly backlogRepo: ScrumBacklogRepository,
    private readonly projectRuntimeService: ProjectRuntimeService,
    private readonly workspaceUserService: WorkspaceUserService,
    private readonly projectAssignables: ProjectAssignableUsersService,
    private readonly auditLogRepository: WorkspaceAuditLogRepository | null = null,
    private readonly workActivityNotifications: WorkActivityNotificationFanoutService | null = null,
  ) {}

  private pushAssignmentActivityNotification(input: {
    workspacePublicId: string
    projectPublicId: string
    workItemPublicId: string
    actorUserPublicId: string
    previousAssigneeUserPublicId: string | null
    nextAssigneeUserPublicId: string | null
    itemTitle: string
    assignmentEventId: string
    at: Date
  }): void {
    if (!this.workActivityNotifications) return
    void this.workActivityNotifications.onAssignmentDelta(input).catch((e) => {
      console.error("[work-activity-notifications] fanout failed", e)
    })
  }

  /**
   * Listado de candidatos a asignación (unión de miembros activos de equipos vinculados al proyecto).
   */
  async listProjectAssignables(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
  ) {
    assertCanReadWorkItemAssignment(actor)
    await this.projectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    return this.projectAssignables.listAssignablesForProject(workspacePublicId, projectPublicId)
  }

  /**
   * `PATCH` lógico: `null` desasigna; coordinador o auto-desasignación; no-coordinador solo a sí mismo o se quita.
   */
  async patchWorkItemAssignment(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    assigneeUserPublicId: string | null,
  ): Promise<WorkItemAssignmentSnapshot> {
    await this.projectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    if (assigneeUserPublicId === null) {
      if (isWorkItemAssignmentCoordinator(actor)) {
        return this.unassignWorkItem(actor, workspacePublicId, projectPublicId, backlogItemPublicId)
      }
      return this.selfUnassignWorkItem(actor, workspacePublicId, projectPublicId, backlogItemPublicId)
    }
    if (assigneeUserPublicId === actor.userPublicId) {
      if (isWorkItemAssignmentCoordinator(actor)) {
        return this.assignWorkItem(
          actor,
          workspacePublicId,
          projectPublicId,
          backlogItemPublicId,
          assigneeUserPublicId,
        )
      }
      return this.selfAssignWorkItem(actor, workspacePublicId, projectPublicId, backlogItemPublicId)
    }
    if (!isWorkItemAssignmentCoordinator(actor)) {
      throw new ProjectWorkAssignmentError(
        "ASG_REASSIGN_NOT_ALLOWED",
        "Only a coordinator may assign the work item to another user.",
      )
    }
    return this.assignWorkItem(
      actor,
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      assigneeUserPublicId,
    )
  }

  async getWorkItemAssignment(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<WorkItemAssignmentSnapshot> {
    assertCanReadWorkItemAssignment(actor)
    await this.projectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const item = await this.requireBacklogItem(workspacePublicId, projectPublicId, backlogItemPublicId)
    return this.snapshotFromItem(item)
  }

  async listWorkItemAssignmentHistory(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<WorkItemAssignmentHistoryEvent[]> {
    assertCanReadWorkItemAssignment(actor)
    await this.projectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const item = await this.requireBacklogItem(workspacePublicId, projectPublicId, backlogItemPublicId)
    return [...item.assignmentHistory].sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime())
  }

  async assignWorkItem(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    assignedUserPublicId: string,
  ): Promise<WorkItemAssignmentSnapshot> {
    assertCanCoordinateWorkItemAssignment(actor)
    await this.projectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const item = await this.requireBacklogItem(workspacePublicId, projectPublicId, backlogItemPublicId)
    this.assertProjectWorkAssignableItemType(item)

    await this.assertNewAssignmentContext(workspacePublicId, projectPublicId, assignedUserPublicId)

    const prev = item.assignedUserPublicId
    if (prev === assignedUserPublicId) {
      return this.snapshotFromItem(item)
    }

    const changeType: WorkItemAssignmentChangeType = prev === null ? "assigned" : "reassigned"
    const now = new Date()
    const event = this.buildEvent({
      actorUserPublicId: actor.userPublicId,
      previousAssignedUserPublicId: prev,
      newAssignedUserPublicId: assignedUserPublicId,
      changeType,
      at: now,
    })

    const updated = await this.backlogRepo.pushAssignmentEventAndSetAssignee(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      {
        assignedUserPublicId: assignedUserPublicId,
        assignmentUpdatedAt: now,
        assignmentUpdatedByUserPublicId: actor.userPublicId,
        event,
      },
    )
    if (!updated) throw new WorkItemAssignmentNotFoundError()
    await this.appendWorkspaceAudit(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      actor.userPublicId,
      now,
      prev,
      assignedUserPublicId,
      event.changeType,
    )
    this.pushAssignmentActivityNotification({
      workspacePublicId,
      projectPublicId,
      workItemPublicId: backlogItemPublicId,
      actorUserPublicId: actor.userPublicId,
      previousAssigneeUserPublicId: prev,
      nextAssigneeUserPublicId: assignedUserPublicId,
      itemTitle: item.title,
      assignmentEventId: event.assignmentEventId,
      at: now,
    })
    return this.snapshotFromItem(updated)
  }

  async unassignWorkItem(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<WorkItemAssignmentSnapshot> {
    assertCanCoordinateWorkItemAssignment(actor)
    await this.projectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const item = await this.requireBacklogItem(workspacePublicId, projectPublicId, backlogItemPublicId)
    this.assertProjectWorkAssignableItemType(item)

    const prev = item.assignedUserPublicId
    if (prev === null) {
      return this.snapshotFromItem(item)
    }

    const now = new Date()
    const event = this.buildEvent({
      actorUserPublicId: actor.userPublicId,
      previousAssignedUserPublicId: prev,
      newAssignedUserPublicId: null,
      changeType: "unassigned",
      at: now,
    })

    const updated = await this.backlogRepo.pushAssignmentEventAndSetAssignee(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      {
        assignedUserPublicId: null,
        assignmentUpdatedAt: now,
        assignmentUpdatedByUserPublicId: actor.userPublicId,
        event,
      },
    )
    if (!updated) throw new WorkItemAssignmentNotFoundError()
    await this.appendWorkspaceAudit(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      actor.userPublicId,
      now,
      prev,
      null,
      event.changeType,
    )
    this.pushAssignmentActivityNotification({
      workspacePublicId,
      projectPublicId,
      workItemPublicId: backlogItemPublicId,
      actorUserPublicId: actor.userPublicId,
      previousAssigneeUserPublicId: prev,
      nextAssigneeUserPublicId: null,
      itemTitle: item.title,
      assignmentEventId: event.assignmentEventId,
      at: now,
    })
    return this.snapshotFromItem(updated)
  }

  async selfAssignWorkItem(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<WorkItemAssignmentSnapshot> {
    assertCanSelfAssignWorkItem(actor)
    await this.projectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const item = await this.requireBacklogItem(workspacePublicId, projectPublicId, backlogItemPublicId)
    this.assertProjectWorkAssignableItemType(item)

    const prev = item.assignedUserPublicId
    if (prev !== null && prev !== actor.userPublicId) {
      throw new WorkItemAssignmentConflictError(
        "This work item is already assigned to someone else. Only a coordinator can reassign it.",
      )
    }
    if (prev === actor.userPublicId) {
      return this.snapshotFromItem(item)
    }

    await this.assertNewAssignmentContext(workspacePublicId, projectPublicId, actor.userPublicId)

    const now = new Date()
    const event = this.buildEvent({
      actorUserPublicId: actor.userPublicId,
      previousAssignedUserPublicId: prev,
      newAssignedUserPublicId: actor.userPublicId,
      changeType: "self_assigned",
      at: now,
    })

    const updated = await this.backlogRepo.pushAssignmentEventAndSetAssignee(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      {
        assignedUserPublicId: actor.userPublicId,
        assignmentUpdatedAt: now,
        assignmentUpdatedByUserPublicId: actor.userPublicId,
        event,
      },
    )
    if (!updated) throw new WorkItemAssignmentNotFoundError()
    await this.appendWorkspaceAudit(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      actor.userPublicId,
      now,
      prev,
      actor.userPublicId,
      event.changeType,
    )
    this.pushAssignmentActivityNotification({
      workspacePublicId,
      projectPublicId,
      workItemPublicId: backlogItemPublicId,
      actorUserPublicId: actor.userPublicId,
      previousAssigneeUserPublicId: prev,
      nextAssigneeUserPublicId: actor.userPublicId,
      itemTitle: item.title,
      assignmentEventId: event.assignmentEventId,
      at: now,
    })
    return this.snapshotFromItem(updated)
  }

  async selfUnassignWorkItem(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<WorkItemAssignmentSnapshot> {
    assertCanSelfAssignWorkItem(actor)
    await this.projectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const item = await this.requireBacklogItem(workspacePublicId, projectPublicId, backlogItemPublicId)
    this.assertProjectWorkAssignableItemType(item)

    const prev = item.assignedUserPublicId
    if (prev === null) {
      return this.snapshotFromItem(item)
    }
    if (prev !== actor.userPublicId) {
      throw new ProjectWorkAssignmentError(
        "ASG_CLEAR_NOT_ALLOWED",
        "You are not the current assignee; you cannot clear assignment on behalf of another user.",
      )
    }

    const now = new Date()
    const event = this.buildEvent({
      actorUserPublicId: actor.userPublicId,
      previousAssignedUserPublicId: prev,
      newAssignedUserPublicId: null,
      changeType: "self_unassigned",
      at: now,
    })

    const updated = await this.backlogRepo.pushAssignmentEventAndSetAssignee(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      {
        assignedUserPublicId: null,
        assignmentUpdatedAt: now,
        assignmentUpdatedByUserPublicId: actor.userPublicId,
        event,
      },
    )
    if (!updated) throw new WorkItemAssignmentNotFoundError()
    await this.appendWorkspaceAudit(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      actor.userPublicId,
      now,
      prev,
      null,
      event.changeType,
    )
    this.pushAssignmentActivityNotification({
      workspacePublicId,
      projectPublicId,
      workItemPublicId: backlogItemPublicId,
      actorUserPublicId: actor.userPublicId,
      previousAssigneeUserPublicId: prev,
      nextAssigneeUserPublicId: null,
      itemTitle: item.title,
      assignmentEventId: event.assignmentEventId,
      at: now,
    })
    return this.snapshotFromItem(updated)
  }

  private snapshotFromItem(item: {
    assignedUserPublicId: string | null
    assignmentUpdatedAt: Date | null
    assignmentUpdatedByUserPublicId: string | null
  }): WorkItemAssignmentSnapshot {
    return {
      assignedUserPublicId: item.assignedUserPublicId,
      assignmentUpdatedAt: item.assignmentUpdatedAt,
      assignmentUpdatedByUserPublicId: item.assignmentUpdatedByUserPublicId,
    }
  }

  private async requireBacklogItem(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<ScrumBacklogItemState> {
    const item = await this.backlogRepo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!item) throw new WorkItemAssignmentNotFoundError()
    return item
  }

  private assertProjectWorkAssignableItemType(item: ScrumBacklogItemState): void {
    if (!isProjectWorkAssignableItemType(item.itemType)) {
      throw new ProjectWorkAssignmentError(
        "ASG_WORK_ITEM_TYPE_NOT_ASSIGNABLE",
        "This work item type does not support assignment in this product version.",
      )
    }
  }

  private async assertNewAssignmentContext(
    workspacePublicId: string,
    projectPublicId: string,
    userPublicId: string,
  ): Promise<void> {
    const hasLink = await this.projectAssignables.hasProjectTeamLink(workspacePublicId, projectPublicId)
    if (!hasLink) {
      throw new ProjectWorkAssignmentError(
        "ASG_PROJECT_HAS_NO_LINKED_TEAMS",
        "The project has no teams linked. Link at least one work team before assigning work.",
      )
    }
    const inUniverse = await this.projectAssignables.isUserInAssignableUniverse(
      workspacePublicId,
      projectPublicId,
      userPublicId,
    )
    if (!inUniverse) {
      throw new ProjectWorkAssignmentError(
        "ASG_ASSIGNEE_NOT_ELIGIBLE",
        "The user is not an active member of a project-linked team, or the team is not in a valid state for assignment.",
      )
    }
    await this.assertAssignableWorkspaceMember(workspacePublicId, userPublicId)
  }

  private async assertAssignableWorkspaceMember(
    workspacePublicId: string,
    userPublicId: string,
  ): Promise<void> {
    const member = await this.workspaceUserService.findActorMember(workspacePublicId, userPublicId)
    if (!member) {
      throw new WorkItemAssignmentValidationError(
        "The selected user is not an active member of this workspace.",
      )
    }
    if (member.status === "deactivated" || member.status === "pending") {
      throw new WorkItemAssignmentValidationError(
        "The selected user cannot be assigned while in this membership state.",
      )
    }
  }

  private async appendWorkspaceAudit(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    actorUserPublicId: string,
    occurredAt: Date,
    previousAssigneeUserPublicId: string | null,
    nextAssigneeUserPublicId: string | null,
    changeType: WorkItemAssignmentChangeType,
  ): Promise<void> {
    if (!this.auditLogRepository) return
    await this.auditLogRepository.append({
      workspacePublicId,
      category: "scrum_backlog_item",
      action: "work_item_assignment_changed",
      actorUserPublicId,
      occurredAt,
      resource: { projectPublicId, backlogItemPublicId },
      previousValue: { assigneeUserPublicId: previousAssigneeUserPublicId },
      nextValue: { assigneeUserPublicId: nextAssigneeUserPublicId, changeType },
    })
  }

  private buildEvent(input: {
    actorUserPublicId: string
    previousAssignedUserPublicId: string | null
    newAssignedUserPublicId: string | null
    changeType: WorkItemAssignmentChangeType
    at: Date
  }): WorkItemAssignmentHistoryEvent {
    return {
      assignmentEventId: randomUUID(),
      changedAt: input.at,
      changedByUserPublicId: input.actorUserPublicId,
      previousAssignedUserPublicId: input.previousAssignedUserPublicId,
      newAssignedUserPublicId: input.newAssignedUserPublicId,
      changeType: input.changeType,
    }
  }
}
