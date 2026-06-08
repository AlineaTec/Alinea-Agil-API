-- Fase 3: projects, work items y FK real en work_team_project_links.

-- CreateEnum
CREATE TYPE "project_draft_status" AS ENUM (
  'definition_in_progress',
  'ready_for_assessment',
  'assessment_in_progress',
  'ready_for_recommendation',
  'recommended',
  'decision_recorded',
  'materialized',
  'not_ready_complete'
);

CREATE TYPE "project_operational_approach" AS ENUM ('scrum', 'kanban', 'predictive_phases');
CREATE TYPE "project_lifecycle_status" AS ENUM ('active', 'archived');
CREATE TYPE "work_item_type" AS ENUM ('epic', 'user_story', 'task', 'subtask', 'bug');
CREATE TYPE "work_item_status" AS ENUM ('open', 'in_progress', 'done');
CREATE TYPE "work_item_priority_level" AS ENUM ('none', 'low', 'medium', 'high', 'urgent');

-- CreateTable
CREATE TABLE "project_drafts" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "created_by_user_public_id" TEXT NOT NULL,
    "status" "project_draft_status" NOT NULL,
    "project_name" TEXT NOT NULL,
    "charter" JSONB NOT NULL DEFAULT '{}',
    "methodology_assessment" JSONB NOT NULL DEFAULT '{}',
    "recommendation_result" JSONB,
    "selected_approach" TEXT,
    "was_recommendation_overridden" BOOLEAN,
    "override_justification" TEXT,
    "materialized_project_public_id" TEXT,
    "trace" JSONB NOT NULL DEFAULT '[]',
    "materialization" JSONB NOT NULL DEFAULT '{"status":"none","materializedProjectPublicId":null}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "source_draft_public_id" TEXT NOT NULL,
    "project_name" TEXT NOT NULL,
    "operational_approach" "project_operational_approach" NOT NULL,
    "initial_configuration_summary" JSONB NOT NULL DEFAULT '{}',
    "lifecycle_status" "project_lifecycle_status" NOT NULL,
    "materialized_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_items" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "parent_item_id" UUID,
    "item_type" "work_item_type" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "work_item_status" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_public_id" TEXT NOT NULL,
    "completed_in_sprint_public_id" TEXT,
    "assigned_user_public_id" TEXT,
    "assignment_updated_at" TIMESTAMP(3),
    "assignment_updated_by_user_public_id" TEXT,
    "assignment_history" JSONB NOT NULL DEFAULT '[]',
    "story_points" INTEGER,
    "priority_level" "work_item_priority_level" NOT NULL DEFAULT 'none',
    "acceptance_criteria" JSONB NOT NULL DEFAULT '[]',
    "comments_count" INTEGER NOT NULL DEFAULT 0,
    "kanban_column_public_id" TEXT,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "blocked_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_item_comments" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "work_item_id" UUID NOT NULL,
    "work_item_public_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_by_user_public_id" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_public_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_item_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_item_time_entries" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "work_item_id" UUID NOT NULL,
    "work_item_public_id" TEXT NOT NULL,
    "user_public_id" TEXT NOT NULL,
    "minutes_spent" INTEGER NOT NULL,
    "work_date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "created_by_user_public_id" TEXT NOT NULL,
    "updated_by_user_public_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_item_time_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_activity_notifications" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "recipient_user_public_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_category" TEXT NOT NULL DEFAULT 'work_activity',
    "source_entity_type" TEXT NOT NULL,
    "source_entity_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "sprint_public_id" TEXT,
    "board_column_public_id" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "actor_user_public_id" TEXT,
    "actor_display_name" TEXT,
    "triggered_at" TIMESTAMP(3) NOT NULL,
    "read_at" TIMESTAMP(3),
    "is_read" BOOLEAN NOT NULL,
    "is_responsibility_related" BOOLEAN NOT NULL,
    "is_following_related" BOOLEAN NOT NULL,
    "navigation_target" JSONB NOT NULL,
    "grouping_key" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "resource_availability" TEXT NOT NULL,
    "retention_expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_activity_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_item_implicit_follows" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "user_public_id" TEXT NOT NULL,
    "work_item_id" UUID NOT NULL,
    "work_item_public_id" TEXT NOT NULL,
    "last_interaction_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_item_implicit_follows_pkey" PRIMARY KEY ("id")
);

-- work_team_project_links: FK real a projects (Fase 3)
ALTER TABLE "work_team_project_links" ADD COLUMN "project_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "project_drafts_public_id_key" ON "project_drafts"("public_id");
CREATE INDEX "project_drafts_workspace_id_updated_at_idx" ON "project_drafts"("workspace_id", "updated_at");

CREATE UNIQUE INDEX "projects_public_id_key" ON "projects"("public_id");
CREATE UNIQUE INDEX "projects_workspace_id_public_id_key" ON "projects"("workspace_id", "public_id");
CREATE UNIQUE INDEX "projects_workspace_id_source_draft_public_id_key" ON "projects"("workspace_id", "source_draft_public_id");

CREATE UNIQUE INDEX "work_items_public_id_key" ON "work_items"("public_id");
CREATE UNIQUE INDEX "work_items_workspace_id_project_id_public_id_key" ON "work_items"("workspace_id", "project_id", "public_id");
CREATE INDEX "work_items_workspace_id_project_id_parent_item_id_sort_order_idx" ON "work_items"("workspace_id", "project_id", "parent_item_id", "sort_order");
CREATE INDEX "work_items_workspace_id_project_id_kanban_column_public_id__idx" ON "work_items"("workspace_id", "project_id", "kanban_column_public_id", "parent_item_id", "sort_order");

CREATE UNIQUE INDEX "work_item_comments_public_id_key" ON "work_item_comments"("public_id");
CREATE UNIQUE INDEX "work_item_comments_workspace_id_project_id_public_id_key" ON "work_item_comments"("workspace_id", "project_id", "public_id");
CREATE INDEX "work_item_comments_workspace_id_project_id_work_item_id_cre_idx" ON "work_item_comments"("workspace_id", "project_id", "work_item_id", "created_at", "public_id");

CREATE UNIQUE INDEX "work_item_time_entries_public_id_key" ON "work_item_time_entries"("public_id");
CREATE UNIQUE INDEX "work_item_time_entries_workspace_id_project_id_public_id_key" ON "work_item_time_entries"("workspace_id", "project_id", "public_id");
CREATE INDEX "work_item_time_entries_item_created_idx" ON "work_item_time_entries"("workspace_id", "project_id", "work_item_id", "created_at", "public_id");
CREATE INDEX "work_item_time_entries_item_work_date_idx" ON "work_item_time_entries"("workspace_id", "project_id", "work_item_id", "work_date");
CREATE INDEX "work_item_time_entries_project_date_user_idx" ON "work_item_time_entries"("workspace_id", "project_id", "work_date", "user_public_id");

CREATE UNIQUE INDEX "work_activity_notifications_public_id_key" ON "work_activity_notifications"("public_id");
CREATE UNIQUE INDEX "work_activity_notifications_dedupe_key_key" ON "work_activity_notifications"("dedupe_key");
CREATE INDEX "work_activity_notifications_recipient_triggered_idx" ON "work_activity_notifications"("recipient_user_public_id", "workspace_id", "triggered_at", "public_id");
CREATE INDEX "work_activity_notifications_recipient_unread_idx" ON "work_activity_notifications"("recipient_user_public_id", "workspace_id", "is_read", "triggered_at");

CREATE UNIQUE INDEX "work_item_implicit_follows_workspace_id_user_public_id_work_item_id_key" ON "work_item_implicit_follows"("workspace_id", "user_public_id", "work_item_id");
CREATE INDEX "work_item_implicit_follows_workspace_id_work_item_id_last_interaction_at_idx" ON "work_item_implicit_follows"("workspace_id", "work_item_id", "last_interaction_at");

DROP INDEX IF EXISTS "work_team_project_links_team_id_project_public_id_key";
CREATE UNIQUE INDEX "work_team_project_links_team_id_project_id_key" ON "work_team_project_links"("team_id", "project_id");

-- AddForeignKey
ALTER TABLE "project_drafts" ADD CONSTRAINT "project_drafts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_source_draft_public_id_fkey" FOREIGN KEY ("source_draft_public_id") REFERENCES "project_drafts"("public_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_items" ADD CONSTRAINT "work_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_parent_item_id_fkey" FOREIGN KEY ("parent_item_id") REFERENCES "work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_item_time_entries" ADD CONSTRAINT "work_item_time_entries_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_item_time_entries" ADD CONSTRAINT "work_item_time_entries_user_public_id_fkey" FOREIGN KEY ("user_public_id") REFERENCES "identity_users"("public_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_activity_notifications" ADD CONSTRAINT "work_activity_notifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_activity_notifications" ADD CONSTRAINT "work_activity_notifications_recipient_user_public_id_fkey" FOREIGN KEY ("recipient_user_public_id") REFERENCES "identity_users"("public_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_activity_notifications" ADD CONSTRAINT "work_activity_notifications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_item_implicit_follows" ADD CONSTRAINT "work_item_implicit_follows_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_item_implicit_follows" ADD CONSTRAINT "work_item_implicit_follows_user_public_id_fkey" FOREIGN KEY ("user_public_id") REFERENCES "identity_users"("public_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_item_implicit_follows" ADD CONSTRAINT "work_item_implicit_follows_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_team_project_links" ADD CONSTRAINT "work_team_project_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
