export const WORKSPACE_ADMINISTRATIVE_ROLES = ["admin", "operator", "auditor"] as const
export type WorkspaceAdministrativeRole = (typeof WORKSPACE_ADMINISTRATIVE_ROLES)[number]

export const WORKSPACE_METHODOLOGICAL_ROLES = [
  "scrum_master",
  "product_owner",
  "scrum_developer",
  "agility_lead",
  "scrum_coach",
] as const
export type WorkspaceMethodologicalRole = (typeof WORKSPACE_METHODOLOGICAL_ROLES)[number]
