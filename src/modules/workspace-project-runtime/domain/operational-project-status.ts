export const OPERATIONAL_PROJECT_STATUSES = ["active", "archived"] as const

export type WorkspaceRuntimeProjectStatus = (typeof OPERATIONAL_PROJECT_STATUSES)[number]
