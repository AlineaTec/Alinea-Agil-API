/*
  Warnings:

  - Made the column `project_id` on table `work_team_project_links` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "impediment_status" AS ENUM ('open', 'in_review', 'mitigating', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "impediment_severity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "work_controls_definition_source" AS ENUM ('system_default', 'workspace_template', 'project');

-- CreateEnum
CREATE TYPE "work_controls_profile_approach" AS ENUM ('scrum', 'kanban');

-- AlterTable
ALTER TABLE "work_team_project_links" ALTER COLUMN "project_id" SET NOT NULL;

-- CreateTable
CREATE TABLE "project_impediments" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "related_work_item_id" UUID,
    "related_work_item_public_id" TEXT,
    "related_sprint_public_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "impediment_status" NOT NULL,
    "severity" "impediment_severity" NOT NULL,
    "responsible_user_public_id" TEXT,
    "reported_by_user_public_id" TEXT NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "resolution_summary" TEXT,
    "dismissal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_impediments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_impediment_comments" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "impediment_id" UUID NOT NULL,
    "impediment_public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_by_user_public_id" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_public_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_impediment_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_controls_project_profiles" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "approach" "work_controls_profile_approach" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "definition_source" "work_controls_definition_source" NOT NULL,
    "criteria" JSONB NOT NULL DEFAULT '[]',
    "kanban_start_execution_column_public_id" TEXT,
    "kanban_done_close_item_column_public_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_controls_project_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_controls_workspace_templates" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "criteria" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_controls_workspace_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_controls_override_tokens" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "work_item_public_id" TEXT NOT NULL,
    "event_code" TEXT NOT NULL,
    "actor_user_public_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_controls_override_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_impediments_public_id_key" ON "project_impediments"("public_id");

-- CreateIndex
CREATE INDEX "project_impediments_project_updated_idx" ON "project_impediments"("workspace_id", "project_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "project_impediments_project_status_idx" ON "project_impediments"("workspace_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "project_impediment_comments_public_id_key" ON "project_impediment_comments"("public_id");

-- CreateIndex
CREATE INDEX "impediment_comments_chronological_idx" ON "project_impediment_comments"("workspace_id", "project_id", "impediment_public_id", "created_at", "public_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_impediment_comments_workspace_id_project_id_public__key" ON "project_impediment_comments"("workspace_id", "project_id", "public_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_controls_project_profiles_workspace_id_project_id_appr_key" ON "work_controls_project_profiles"("workspace_id", "project_id", "approach");

-- CreateIndex
CREATE UNIQUE INDEX "work_controls_workspace_templates_workspace_id_key" ON "work_controls_workspace_templates"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_controls_workspace_templates_workspace_public_id_key" ON "work_controls_workspace_templates"("workspace_public_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_controls_override_tokens_public_id_key" ON "work_controls_override_tokens"("public_id");

-- CreateIndex
CREATE INDEX "work_controls_override_tokens_expires_at_idx" ON "work_controls_override_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "project_impediments" ADD CONSTRAINT "project_impediments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_impediments" ADD CONSTRAINT "project_impediments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_impediments" ADD CONSTRAINT "project_impediments_related_work_item_id_fkey" FOREIGN KEY ("related_work_item_id") REFERENCES "work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_impediments" ADD CONSTRAINT "project_impediments_reported_by_user_public_id_fkey" FOREIGN KEY ("reported_by_user_public_id") REFERENCES "identity_users"("public_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_impediments" ADD CONSTRAINT "project_impediments_responsible_user_public_id_fkey" FOREIGN KEY ("responsible_user_public_id") REFERENCES "identity_users"("public_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_impediment_comments" ADD CONSTRAINT "project_impediment_comments_impediment_id_fkey" FOREIGN KEY ("impediment_id") REFERENCES "project_impediments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_impediment_comments" ADD CONSTRAINT "project_impediment_comments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_impediment_comments" ADD CONSTRAINT "project_impediment_comments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_impediment_comments" ADD CONSTRAINT "project_impediment_comments_created_by_user_public_id_fkey" FOREIGN KEY ("created_by_user_public_id") REFERENCES "identity_users"("public_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_controls_project_profiles" ADD CONSTRAINT "work_controls_project_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_controls_project_profiles" ADD CONSTRAINT "work_controls_project_profiles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_controls_workspace_templates" ADD CONSTRAINT "work_controls_workspace_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_controls_override_tokens" ADD CONSTRAINT "work_controls_override_tokens_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_controls_override_tokens" ADD CONSTRAINT "work_controls_override_tokens_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_controls_override_tokens" ADD CONSTRAINT "work_controls_override_tokens_actor_user_public_id_fkey" FOREIGN KEY ("actor_user_public_id") REFERENCES "identity_users"("public_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "daily_alignment_participant_updates_session_id_user_public_id_k" RENAME TO "daily_alignment_participant_updates_session_id_user_public__key";

-- RenameIndex
ALTER INDEX "daily_alignment_sessions_workspace_id_project_id_session_date_s" RENAME TO "daily_alignment_sessions_workspace_id_project_id_session_da_key";

-- RenameIndex
ALTER INDEX "guided_refinement_reviewed_items_workspace_id_project_id_sessio" RENAME TO "guided_refinement_reviewed_items_workspace_id_project_id_se_key";

-- RenameIndex
ALTER INDEX "guided_refinement_sessions_workspace_id_project_id_session_date" RENAME TO "guided_refinement_sessions_workspace_id_project_id_session__key";

-- RenameIndex
ALTER INDEX "guided_retrospective_sessions_workspace_id_project_id_session_d" RENAME TO "guided_retrospective_sessions_workspace_id_project_id_sessi_key";

-- RenameIndex
ALTER INDEX "guided_retrospective_votes_workspace_id_project_id_session_id_u" RENAME TO "guided_retrospective_votes_workspace_id_project_id_session__key";

-- RenameIndex
ALTER INDEX "guided_review_demonstrated_items_workspace_id_project_id_sessio" RENAME TO "guided_review_demonstrated_items_workspace_id_project_id_se_key";

-- RenameIndex
ALTER INDEX "guided_review_sessions_workspace_id_project_id_session_date_ses" RENAME TO "guided_review_sessions_workspace_id_project_id_session_date_key";

-- RenameIndex
ALTER INDEX "guided_sprint_planning_candidate_items_workspace_id_project_id_" RENAME TO "guided_sprint_planning_candidate_items_workspace_id_project_key";

-- RenameIndex
ALTER INDEX "sprint_assignments_workspace_id_project_id_sprint_id_work_item_" RENAME TO "sprint_assignments_workspace_id_project_id_sprint_id_work_i_key";

-- RenameIndex
ALTER INDEX "work_item_implicit_follows_workspace_id_user_public_id_work_ite" RENAME TO "work_item_implicit_follows_workspace_id_user_public_id_work_key";

-- RenameIndex
ALTER INDEX "work_item_implicit_follows_workspace_id_work_item_id_last_inter" RENAME TO "work_item_implicit_follows_workspace_id_work_item_id_last_i_idx";

-- RenameIndex
ALTER INDEX "work_items_workspace_id_project_id_parent_item_id_sort_order_id" RENAME TO "work_items_workspace_id_project_id_parent_item_id_sort_orde_idx";
