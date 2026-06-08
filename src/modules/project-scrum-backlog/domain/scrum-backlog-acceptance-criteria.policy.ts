import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { AcceptanceCriterionState } from "./acceptance-criterion.js"
import { ScrumBacklogForbiddenError } from "./scrum-backlog.errors.js"

/**
 * Actores que pueden usar PATCH **solo** con `acceptanceCriteria` (sin otros campos).
 * Alineado a contracts-docs work-item-acceptance-criteria: revisión amplia + ejecución.
 */
export function assertCanPatchAcceptanceCriteriaOnly(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new ScrumBacklogForbiddenError("Deactivated members cannot update acceptance criteria.")
  }
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator") return
  if (
    mr === "agility_lead" ||
    mr === "scrum_master" ||
    mr === "product_owner" ||
    mr === "scrum_developer"
  ) {
    return
  }
  throw new ScrumBacklogForbiddenError(
    "Only admin, operator, agility_lead, scrum_master, product_owner, or scrum_developer may PATCH acceptance criteria alone.",
  )
}

function isReviewCoordinator(actor: WorkspaceMemberState): boolean {
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  return (
    ar === "admin" ||
    ar === "operator" ||
    mr === "agility_lead" ||
    mr === "scrum_master" ||
    mr === "product_owner"
  )
}

function isScrumDeveloper(actor: WorkspaceMemberState): boolean {
  return actor.workspaceRoleMethodological === "scrum_developer"
}

function isReviewedStatusChange(before: AcceptanceCriterionState | undefined, after: AcceptanceCriterionState): boolean {
  if (!before) {
    return after.status === "reviewed"
  }
  return (
    before.status !== after.status &&
    (before.status === "reviewed" || after.status === "reviewed")
  )
}

/**
 * Permisos granulares cuando el PATCH incluye **solo** `acceptanceCriteria`.
 * @param inActiveSprint — el ítem tiene membresía en algún sprint `active`.
 */
export function assertAcceptanceCriteriaChangesAllowed(
  actor: WorkspaceMemberState,
  previous: readonly AcceptanceCriterionState[],
  next: readonly AcceptanceCriterionState[],
  inActiveSprint: boolean,
): void {
  const prevMap = new Map(previous.map((c) => [c.acceptanceCriterionPublicId, c]))
  const nextIds = new Set(next.map((c) => c.acceptanceCriterionPublicId))

  for (const id of prevMap.keys()) {
    if (!nextIds.has(id)) {
      if (inActiveSprint) {
        if (!isReviewCoordinator(actor)) {
          throw new ScrumBacklogForbiddenError(
            "Only review/coordination roles may delete acceptance criteria during an active sprint.",
          )
        }
      } else if (!isReviewCoordinator(actor) && !isScrumDeveloper(actor)) {
        throw new ScrumBacklogForbiddenError("You cannot delete acceptance criteria.")
      }
    }
  }

  for (const after of next) {
    const before = prevMap.get(after.acceptanceCriterionPublicId)

    if (!before) {
      if (!isReviewCoordinator(actor) && !isScrumDeveloper(actor)) {
        throw new ScrumBacklogForbiddenError("You cannot add acceptance criteria.")
      }
      if (after.status === "reviewed" && !isReviewCoordinator(actor)) {
        throw new ScrumBacklogForbiddenError(
          "Only review/coordination roles can create a criterion already marked reviewed.",
        )
      }
      continue
    }

    const textChanged = before.text !== after.text
    if (textChanged) {
      if (before.status === "reviewed" || after.status === "reviewed") {
        if (!isReviewCoordinator(actor)) {
          throw new ScrumBacklogForbiddenError(
            "Only review/coordination roles can edit text while a criterion is or becomes reviewed.",
          )
        }
      } else if (!isReviewCoordinator(actor) && !isScrumDeveloper(actor)) {
        throw new ScrumBacklogForbiddenError("You cannot edit acceptance criterion text.")
      }
    }

    if (isReviewedStatusChange(before, after)) {
      if (!isReviewCoordinator(actor)) {
        throw new ScrumBacklogForbiddenError(
          "Only review/coordination roles can set or clear the reviewed status.",
        )
      }
    } else if (before.status !== after.status) {
      if (!isReviewCoordinator(actor) && !isScrumDeveloper(actor)) {
        throw new ScrumBacklogForbiddenError("You cannot change acceptance criterion status.")
      }
    }
  }
}
