import type { PrismaClient } from "@prisma/client"
import type {
  PlatformTenantMetricsReader,
  ProjectApproachCounts,
} from "../platform-tenant-metrics.reader.js"

export class PlatformTenantMetricsPrismaReader implements PlatformTenantMetricsReader {
  constructor(private readonly prisma: PrismaClient) {}

  async countProjects(workspacePublicId: string): Promise<number> {
    return this.prisma.project.count({ where: { workspace_public_id: workspacePublicId } })
  }

  async countActiveMembers(workspacePublicId: string): Promise<number> {
    return this.prisma.workspaceMember.count({
      where: {
        workspace_public_id: workspacePublicId,
        status: { in: ["active", "active_without_seat"] },
      },
    })
  }

  async countProjectsByApproach(workspacePublicId: string): Promise<ProjectApproachCounts> {
    const grouped = await this.prisma.project.groupBy({
      by: ["operational_approach"],
      where: { workspace_public_id: workspacePublicId },
      _count: { _all: true },
    })
    const out: ProjectApproachCounts = { scrum: 0, kanban: 0, other: 0 }
    for (const row of grouped) {
      const c = row._count._all
      if (row.operational_approach === "scrum") out.scrum = c
      else if (row.operational_approach === "kanban") out.kanban = c
      else out.other += c
    }
    return out
  }
}
