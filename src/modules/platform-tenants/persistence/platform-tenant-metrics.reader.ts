export type ProjectApproachCounts = {
  scrum: number
  kanban: number
  other: number
}

export interface PlatformTenantMetricsReader {
  countProjects(workspacePublicId: string): Promise<number>
  countActiveMembers(workspacePublicId: string): Promise<number>
  countProjectsByApproach(workspacePublicId: string): Promise<ProjectApproachCounts>
}
