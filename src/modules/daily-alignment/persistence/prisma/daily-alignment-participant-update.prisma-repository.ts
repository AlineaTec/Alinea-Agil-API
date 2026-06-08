import { Prisma, type PrismaClient } from "@prisma/client"
import { resolveDailyAlignmentSessionId } from "../../../../infrastructure/postgres/guided-sessions-scope.js"
import {
  resolveProjectId,
} from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { DailyAlignmentParticipantUpdateState } from "../../domain/daily-alignment-session.js"
import type {
  DailyAlignmentParticipantUpdateRepository,
  UpsertDailyAlignmentParticipantInput,
} from "../daily-alignment-participant-update.repository.js"
import type { DailyAlignmentParticipantUpdate } from "@prisma/client"

function rowToState(row: DailyAlignmentParticipantUpdate): DailyAlignmentParticipantUpdateState {
  return {
    participantUpdatePublicId: row.public_id,
    sessionPublicId: row.session_public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    userPublicId: row.user_public_id,
    yesterdaySummary: row.yesterday_summary,
    todayPlan: row.today_plan,
    impediments: row.impediments,
    suggestionBasisSnapshot: row.suggestion_basis_snapshot,
    consistencyHintsSnapshot: row.consistency_hints_snapshot,
    sourceMode: row.source_mode as DailyAlignmentParticipantUpdateState["sourceMode"],
    isSubmitted: row.is_submitted,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** PostgreSQL: `daily_alignment_participant_updates`. */
export class DailyAlignmentParticipantUpdatePrismaRepository
  implements DailyAlignmentParticipantUpdateRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async findBySessionAndUser(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    userPublicId: string,
  ): Promise<DailyAlignmentParticipantUpdateState | null> {
    const row = await this.prisma.dailyAlignmentParticipantUpdate.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
        user_public_id: userPublicId,
      },
    })
    return row ? rowToState(row) : null
  }

  async listBySession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<DailyAlignmentParticipantUpdateState[]> {
    const rows = await this.prisma.dailyAlignmentParticipantUpdate.findMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
      },
      orderBy: { user_public_id: "asc" },
    })
    return rows.map(rowToState)
  }

  async upsert(input: UpsertDailyAlignmentParticipantInput): Promise<DailyAlignmentParticipantUpdateState> {
    const workspaceId = await resolveWorkspaceId(this.prisma, input.workspacePublicId)
    const projectId = await resolveProjectId(
      this.prisma,
      input.workspacePublicId,
      input.projectPublicId,
    )
    const sessionId = await resolveDailyAlignmentSessionId(
      this.prisma,
      input.workspacePublicId,
      input.projectPublicId,
      input.sessionPublicId,
    )
    if (!workspaceId || !projectId || !sessionId) {
      throw new Error("daily_alignment_participant_upsert_context_not_found")
    }

    const row = await this.prisma.dailyAlignmentParticipantUpdate.upsert({
      where: {
        session_id_user_public_id: {
          session_id: sessionId,
          user_public_id: input.userPublicId,
        },
      },
      create: {
        public_id: input.participantUpdatePublicId,
        session_id: sessionId,
        session_public_id: input.sessionPublicId,
        workspace_id: workspaceId,
        workspace_public_id: input.workspacePublicId,
        project_id: projectId,
        project_public_id: input.projectPublicId,
        user_public_id: input.userPublicId,
        yesterday_summary: input.yesterdaySummary,
        today_plan: input.todayPlan,
        impediments: input.impediments,
        suggestion_basis_snapshot: input.suggestionBasisSnapshot
          ? (input.suggestionBasisSnapshot as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        consistency_hints_snapshot: input.consistencyHintsSnapshot
          ? (input.consistencyHintsSnapshot as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        source_mode: input.sourceMode,
        is_submitted: input.isSubmitted,
        submitted_at: input.submittedAt,
        created_at: input.createdAt,
        updated_at: input.updatedAt,
      },
      update: {
        public_id: input.participantUpdatePublicId,
        yesterday_summary: input.yesterdaySummary,
        today_plan: input.todayPlan,
        impediments: input.impediments,
        suggestion_basis_snapshot: input.suggestionBasisSnapshot
          ? (input.suggestionBasisSnapshot as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        consistency_hints_snapshot: input.consistencyHintsSnapshot
          ? (input.consistencyHintsSnapshot as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        source_mode: input.sourceMode,
        is_submitted: input.isSubmitted,
        submitted_at: input.submittedAt,
        updated_at: input.updatedAt,
      },
    })
    return rowToState(row)
  }
}
