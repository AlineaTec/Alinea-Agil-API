-- Fase 4: Scrum/Kanban operativo (sprints, assignments, guided planning, kanban flow).

CREATE TYPE "scrum_sprint_status" AS ENUM ('planning', 'ready_for_execution', 'active', 'closed');
CREATE TYPE "guided_sprint_planning_session_status" AS ENUM (
  'open',
  'closed',
  'closed_with_warnings',
  'closed_without_baseline'
);

CREATE TABLE "sprints" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT NOT NULL DEFAULT '',
    "status" "scrum_sprint_status" NOT NULL,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "created_by_user_public_id" TEXT NOT NULL,
    "closure" JSONB,
    "review" JSONB,
    "retrospective" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sprints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sprint_assignments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "sprint_id" UUID NOT NULL,
    "sprint_public_id" TEXT NOT NULL,
    "work_item_id" UUID NOT NULL,
    "work_item_public_id" TEXT NOT NULL,
    "sprint_sort_order" INTEGER NOT NULL,
    "committed_at" TIMESTAMP(3) NOT NULL,
    "committed_by_user_public_id" TEXT NOT NULL,
    "board_column" TEXT,

    CONSTRAINT "sprint_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guided_sprint_planning_sessions" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "sprint_id" UUID,
    "sprint_public_id" TEXT,
    "session_date" TEXT NOT NULL,
    "session_slot" TEXT NOT NULL,
    "operational_approach" TEXT NOT NULL,
    "operational_time_zone" TEXT NOT NULL,
    "planning_mode" TEXT NOT NULL,
    "facilitator_user_public_id" TEXT,
    "product_owner_user_public_id" TEXT,
    "status" "guided_sprint_planning_session_status" NOT NULL,
    "planning_goal_draft" TEXT,
    "sprint_goal_final" TEXT,
    "summary" TEXT,
    "agreements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "follow_ups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "capacity_total" INTEGER,
    "capacity_unit" TEXT,
    "buffer_reserved" INTEGER,
    "buffer_mode" TEXT,
    "candidate_item_count" INTEGER NOT NULL DEFAULT 0,
    "committed_item_count" INTEGER NOT NULL DEFAULT 0,
    "excluded_item_count" INTEGER NOT NULL DEFAULT 0,
    "pending_decision_count" INTEGER NOT NULL DEFAULT 0,
    "planning_warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "baseline_created" BOOLEAN NOT NULL DEFAULT false,
    "baseline_public_id" TEXT,
    "additive_notes_after_close" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "transcript_after_close" JSONB,
    "started_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guided_sprint_planning_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guided_sprint_planning_candidate_items" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "session_id" UUID NOT NULL,
    "session_public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "sprint_id" UUID,
    "sprint_public_id" TEXT,
    "work_item_id" UUID NOT NULL,
    "work_item_public_id" TEXT NOT NULL,
    "is_ready_for_planning" BOOLEAN NOT NULL DEFAULT false,
    "is_committed" BOOLEAN NOT NULL DEFAULT false,
    "is_excluded" BOOLEAN NOT NULL DEFAULT false,
    "excluded_reason" TEXT,
    "excluded_reason_notes" TEXT,
    "risk_notes" TEXT,
    "dependency_notes" TEXT,
    "capacity_concern" TEXT NOT NULL DEFAULT 'none',
    "planning_decision_notes" TEXT,
    "commitment_decision_by_user_public_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guided_sprint_planning_candidate_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guided_sprint_planning_baselines" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "session_id" UUID NOT NULL,
    "session_public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "sprint_id" UUID,
    "sprint_public_id" TEXT,
    "sprint_goal" TEXT,
    "committed_work_item_public_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "capacity_total" INTEGER,
    "capacity_unit" TEXT,
    "buffer_reserved" INTEGER,
    "known_risks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "known_dependencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "baseline_warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_public_id" TEXT NOT NULL,

    CONSTRAINT "guided_sprint_planning_baselines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kanban_flow_configs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "entry_column_public_id" TEXT NOT NULL,
    "wip_near_threshold_ratio" DOUBLE PRECISION,
    "flow_definition" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kanban_flow_configs_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "sprints_public_id_key" ON "sprints"("public_id");
CREATE UNIQUE INDEX "sprints_workspace_id_project_id_public_id_key" ON "sprints"("workspace_id", "project_id", "public_id");
CREATE INDEX "sprints_workspace_project_status_idx" ON "sprints"("workspace_id", "project_id", "status");

CREATE UNIQUE INDEX "sprint_assignments_workspace_id_project_id_sprint_id_work_item_id_key"
  ON "sprint_assignments"("workspace_id", "project_id", "sprint_id", "work_item_id");
CREATE INDEX "sprint_assignments_by_work_item_idx" ON "sprint_assignments"("workspace_id", "project_id", "work_item_id");
CREATE INDEX "sprint_assignments_sprint_order_idx" ON "sprint_assignments"("workspace_id", "project_id", "sprint_id", "sprint_sort_order");

CREATE UNIQUE INDEX "guided_sprint_planning_sessions_public_id_key" ON "guided_sprint_planning_sessions"("public_id");
CREATE INDEX "guided_sprint_planning_sessions_project_updated_idx" ON "guided_sprint_planning_sessions"("workspace_id", "project_id", "updated_at");

CREATE UNIQUE INDEX "guided_sprint_planning_sessions_sprint_bound_key"
  ON "guided_sprint_planning_sessions"("workspace_id", "project_id", "sprint_public_id")
  WHERE "sprint_public_id" IS NOT NULL;

CREATE UNIQUE INDEX "guided_sprint_planning_sessions_flow_window_key"
  ON "guided_sprint_planning_sessions"("workspace_id", "project_id", "session_date", "session_slot")
  WHERE "sprint_public_id" IS NULL;

CREATE UNIQUE INDEX "guided_sprint_planning_candidate_items_public_id_key" ON "guided_sprint_planning_candidate_items"("public_id");
CREATE UNIQUE INDEX "guided_sprint_planning_candidate_items_workspace_id_project_id_session_id_work_item_id_key"
  ON "guided_sprint_planning_candidate_items"("workspace_id", "project_id", "session_id", "work_item_id");

CREATE UNIQUE INDEX "guided_sprint_planning_baselines_public_id_key" ON "guided_sprint_planning_baselines"("public_id");
CREATE UNIQUE INDEX "guided_sprint_planning_baselines_session_id_key" ON "guided_sprint_planning_baselines"("session_id");
CREATE UNIQUE INDEX "guided_sprint_planning_baselines_session_public_id_key" ON "guided_sprint_planning_baselines"("session_public_id");
CREATE INDEX "guided_sprint_planning_baselines_sprint_created_idx" ON "guided_sprint_planning_baselines"("workspace_id", "project_id", "sprint_id", "created_at");

CREATE UNIQUE INDEX "kanban_flow_configs_project_id_key" ON "kanban_flow_configs"("project_id");
CREATE UNIQUE INDEX "kanban_flow_configs_workspace_id_project_id_key" ON "kanban_flow_configs"("workspace_id", "project_id");

-- Foreign keys
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sprint_assignments" ADD CONSTRAINT "sprint_assignments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sprint_assignments" ADD CONSTRAINT "sprint_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sprint_assignments" ADD CONSTRAINT "sprint_assignments_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "sprints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sprint_assignments" ADD CONSTRAINT "sprint_assignments_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guided_sprint_planning_sessions" ADD CONSTRAINT "guided_sprint_planning_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guided_sprint_planning_sessions" ADD CONSTRAINT "guided_sprint_planning_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guided_sprint_planning_sessions" ADD CONSTRAINT "guided_sprint_planning_sessions_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "sprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "guided_sprint_planning_candidate_items" ADD CONSTRAINT "guided_sprint_planning_candidate_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "guided_sprint_planning_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guided_sprint_planning_candidate_items" ADD CONSTRAINT "guided_sprint_planning_candidate_items_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guided_sprint_planning_baselines" ADD CONSTRAINT "guided_sprint_planning_baselines_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "guided_sprint_planning_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guided_sprint_planning_baselines" ADD CONSTRAINT "guided_sprint_planning_baselines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guided_sprint_planning_baselines" ADD CONSTRAINT "guided_sprint_planning_baselines_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "sprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "kanban_flow_configs" ADD CONSTRAINT "kanban_flow_configs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kanban_flow_configs" ADD CONSTRAINT "kanban_flow_configs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
