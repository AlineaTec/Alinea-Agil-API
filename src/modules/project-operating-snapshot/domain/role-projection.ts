import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type {
  AlertCategory,
  HubLayoutVariant,
  RoleProjectionBlock,
  ViewerAccessLevel,
  ViewerRole,
} from "./operating-snapshot.dto.js"

export function resolveViewerRole(actor: WorkspaceMemberState): ViewerRole {
  const m = actor.workspaceRoleMethodological
  const a = actor.workspaceRoleAdministrative

  if (a === "auditor") return "stakeholder"
  if (m === "product_owner") return "product_owner"
  if (m === "scrum_master" || m === "agility_lead" || m === "scrum_coach") return "scrum_master"
  if (m === "scrum_developer") return "developer"
  if (a === "admin" || a === "operator") return "leader"
  return "mixed"
}

export function resolveViewerAccessLevel(role: ViewerRole): ViewerAccessLevel {
  if (role === "stakeholder") return "stakeholder"
  if (role === "developer") return "operational"
  if (role === "leader") return "read_only"
  return "full"
}

export function buildRoleProjection(role: ViewerRole): RoleProjectionBlock {
  switch (role) {
    case "product_owner":
      return {
        viewerRole: role,
        emphasizedBlocks: ["wizardState", "focusCycle", "signals", "nextBestAction"],
        hiddenAlertCategories: [],
        nbaPriorityOverride: null,
        hubLayoutVariant: "full",
      }
    case "scrum_master":
      return {
        viewerRole: role,
        emphasizedBlocks: ["wizardState", "focusCycle", "ritualStatus", "alerts", "nextBestAction"],
        hiddenAlertCategories: [],
        nbaPriorityOverride: null,
        hubLayoutVariant: "full",
      }
    case "developer":
      return {
        viewerRole: role,
        emphasizedBlocks: ["nextBestAction", "focusCycle", "signals"],
        hiddenAlertCategories: ["methodological"] as AlertCategory[],
        nbaPriorityOverride: null,
        hubLayoutVariant: "operational",
      }
    case "leader":
      return {
        viewerRole: role,
        emphasizedBlocks: ["wizardState", "focusCycle", "signals"],
        hiddenAlertCategories: ["ceremonial"],
        nbaPriorityOverride: null,
        hubLayoutVariant: "executive",
      }
    case "stakeholder":
      return {
        viewerRole: role,
        emphasizedBlocks: ["wizardState", "focusCycle"],
        hiddenAlertCategories: ["operational", "methodological", "ceremonial"],
        nbaPriorityOverride: null,
        hubLayoutVariant: "stakeholder_readonly",
      }
    default:
      return {
        viewerRole: "mixed",
        emphasizedBlocks: ["wizardState", "focusCycle", "nextBestAction"],
        hiddenAlertCategories: [],
        nbaPriorityOverride: null,
        hubLayoutVariant: "full",
      }
  }
}

export function filterAlertsForRole<T extends { category: AlertCategory; severity: string }>(
  alerts: T[],
  role: ViewerRole,
): T[] {
  const projection = buildRoleProjection(role)
  const hidden = new Set(projection.hiddenAlertCategories)
  return alerts.filter((a) => {
    if (hidden.has(a.category) && a.severity !== "critical") return false
    if (role === "stakeholder" && a.severity !== "info" && a.severity !== "critical") return false
    return true
  })
}

export function layoutVariant(role: ViewerRole): HubLayoutVariant {
  return buildRoleProjection(role).hubLayoutVariant
}
