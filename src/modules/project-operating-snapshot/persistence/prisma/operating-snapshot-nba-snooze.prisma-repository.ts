import type { PrismaClient } from "@prisma/client"
import { resolveFeedbackWorkspaceProjectIds } from "../../../../infrastructure/postgres/feedback-scope.js"
import type {
  OperatingSnapshotNbaSnoozeRepository,
  OperatingSnapshotNbaSnoozeState,
} from "../operating-snapshot-nba-snooze.repository.js"

function rowToState(row: {
  public_id: string
  workspace_public_id: string
  project_public_id: string
  user_public_id: string
  snooze_key: string
  snoozed_until_operational_date: string
  created_at: Date
  updated_at: Date
}): OperatingSnapshotNbaSnoozeState {
  return {
    snoozePublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    userPublicId: row.user_public_id,
    snoozeKey: row.snooze_key,
    snoozedUntilOperationalDate: row.snoozed_until_operational_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class OperatingSnapshotNbaSnoozePrismaRepository implements OperatingSnapshotNbaSnoozeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(state: OperatingSnapshotNbaSnoozeState): Promise<void> {
    const scope = await resolveFeedbackWorkspaceProjectIds(
      this.prisma,
      state.workspacePublicId,
      state.projectPublicId,
    )
    if (!scope?.projectId) throw new Error(`nba_snooze_project_not_found:${state.projectPublicId}`)

    await this.prisma.projectOperatingSnapshotNbaSnooze.upsert({
      where: {
        workspace_id_project_id_user_public_id_snooze_key: {
          workspace_id: scope.workspaceId,
          project_id: scope.projectId,
          user_public_id: state.userPublicId,
          snooze_key: state.snoozeKey,
        },
      },
      create: {
        public_id: state.snoozePublicId,
        workspace_id: scope.workspaceId,
        workspace_public_id: state.workspacePublicId,
        project_id: scope.projectId,
        project_public_id: state.projectPublicId,
        user_public_id: state.userPublicId,
        snooze_key: state.snoozeKey,
        snoozed_until_operational_date: state.snoozedUntilOperationalDate,
        created_at: state.createdAt,
        updated_at: state.updatedAt,
      },
      update: {
        snoozed_until_operational_date: state.snoozedUntilOperationalDate,
        updated_at: state.updatedAt,
      },
    })
  }

  async listActiveForUserProject(
    workspacePublicId: string,
    projectPublicId: string,
    userPublicId: string,
    operationalDateYmd: string,
  ): Promise<OperatingSnapshotNbaSnoozeState[]> {
    const rows = await this.prisma.projectOperatingSnapshotNbaSnooze.findMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        user_public_id: userPublicId,
        snoozed_until_operational_date: { gte: operationalDateYmd },
      },
    })
    return rows.map(rowToState)
  }

  async deleteExpiredBefore(operationalDateYmd: string): Promise<number> {
    const res = await this.prisma.projectOperatingSnapshotNbaSnooze.deleteMany({
      where: { snoozed_until_operational_date: { lt: operationalDateYmd } },
    })
    return res.count
  }
}
