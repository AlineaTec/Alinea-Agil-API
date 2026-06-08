-- Fase 5: guided sessions (daily, refinement, review, retrospective).

CREATE TABLE "daily_alignment_sessions" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "session_date" TEXT NOT NULL,
    "session_slot" TEXT NOT NULL,
    "sprint_id" UUID,
    "sprint_public_id" TEXT,
    "operational_approach" TEXT NOT NULL,
    "operational_time_zone" TEXT NOT NULL,
    "alignment_mode" TEXT NOT NULL,
    "facilitator_user_public_id" TEXT,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "closeout_summary" TEXT,
    "facilitator_transcript" TEXT,
    "agreements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "escalated_impediments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "follow_ups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "daily_alignment_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "daily_alignment_participant_updates" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "session_id" UUID NOT NULL,
    "session_public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "user_public_id" TEXT NOT NULL,
    "yesterday_summary" TEXT NOT NULL DEFAULT '',
    "today_plan" TEXT NOT NULL DEFAULT '',
    "impediments" TEXT NOT NULL DEFAULT '',
    "suggestion_basis_snapshot" JSONB,
    "consistency_hints_snapshot" JSONB,
    "source_mode" TEXT NOT NULL,
    "is_submitted" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "daily_alignment_participant_updates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guided_refinement_sessions" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "session_date" TEXT NOT NULL,
    "session_slot" TEXT NOT NULL,
    "sprint_id" UUID,
    "sprint_public_id" TEXT,
    "operational_approach" TEXT NOT NULL,
    "operational_time_zone" TEXT NOT NULL,
    "refinement_mode" TEXT NOT NULL,
    "facilitator_user_public_id" TEXT,
    "product_owner_user_public_id" TEXT,
    "status" TEXT NOT NULL,
    "focus_summary" TEXT,
    "candidate_work_item_public_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "close_summary" TEXT,
    "agreements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "follow_ups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "open_questions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "additive_notes_after_close" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewed_item_count" INTEGER NOT NULL DEFAULT 0,
    "ready_for_planning_count" INTEGER NOT NULL DEFAULT 0,
    "pending_candidate_review_count" INTEGER NOT NULL DEFAULT 0,
    "reviewed_not_ready_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guided_refinement_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guided_refinement_reviewed_items" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "session_id" UUID NOT NULL,
    "session_public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "session_date" TEXT NOT NULL,
    "work_item_id" UUID NOT NULL,
    "work_item_public_id" TEXT NOT NULL,
    "review_status" TEXT NOT NULL,
    "ready_for_planning" BOOLEAN NOT NULL DEFAULT false,
    "ready_with_observations" BOOLEAN NOT NULL DEFAULT false,
    "observations" TEXT,
    "business_clarifications" TEXT,
    "technical_questions" TEXT,
    "dependencies_text" TEXT,
    "risks_text" TEXT,
    "estimation_status" TEXT NOT NULL,
    "size_concern" TEXT NOT NULL,
    "not_ready_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "follow_up_required" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by_user_public_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guided_refinement_reviewed_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guided_review_sessions" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "session_date" TEXT NOT NULL,
    "session_slot" TEXT NOT NULL,
    "sprint_id" UUID,
    "sprint_public_id" TEXT,
    "operational_approach" TEXT NOT NULL,
    "operational_time_zone" TEXT NOT NULL,
    "review_mode" TEXT NOT NULL,
    "facilitator_user_public_id" TEXT,
    "product_owner_user_public_id" TEXT,
    "status" TEXT NOT NULL,
    "review_goal_summary" TEXT,
    "close_summary" TEXT,
    "agreements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "follow_ups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stakeholder_summary" TEXT,
    "open_questions_remaining" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "methodological_notes" TEXT,
    "increment_assessment" TEXT,
    "sprint_goal_assessment" TEXT,
    "sprint_goal_assessment_explanation" TEXT,
    "transcript_after_close" JSONB,
    "additive_notes_after_close" JSONB NOT NULL DEFAULT '[]',
    "demonstrated_item_count" INTEGER NOT NULL DEFAULT 0,
    "feedback_count" INTEGER NOT NULL DEFAULT 0,
    "backlog_impact_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guided_review_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guided_review_demonstrated_items" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "session_id" UUID NOT NULL,
    "session_public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "session_date" TEXT NOT NULL,
    "work_item_id" UUID NOT NULL,
    "work_item_public_id" TEXT NOT NULL,
    "demonstration_status" TEXT NOT NULL,
    "demonstrated_by_user_public_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "demo_notes" TEXT,
    "stakeholder_feedback_summary" TEXT,
    "questions_raised" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "follow_up_required" BOOLEAN NOT NULL DEFAULT false,
    "backlog_impact_suggested" BOOLEAN NOT NULL DEFAULT false,
    "priority_impact_suggested" BOOLEAN NOT NULL DEFAULT false,
    "requires_further_validation" BOOLEAN NOT NULL DEFAULT false,
    "review_outcome" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guided_review_demonstrated_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guided_review_feedback_entries" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "session_id" UUID NOT NULL,
    "session_public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "stakeholder_display_name" TEXT,
    "body" TEXT NOT NULL,
    "feedback_category" TEXT NOT NULL,
    "affects_work_item_public_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_general_feedback" BOOLEAN NOT NULL,
    "suggested_backlog_action" TEXT,
    "suggested_priority_impact" TEXT,
    "follow_up_required" BOOLEAN NOT NULL DEFAULT false,
    "backlog_impact_suggested" BOOLEAN NOT NULL DEFAULT false,
    "priority_impact_suggested" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_public_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guided_review_feedback_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guided_retrospective_sessions" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "session_date" TEXT NOT NULL,
    "session_slot" TEXT NOT NULL,
    "sprint_id" UUID,
    "sprint_public_id" TEXT,
    "retrospective_period" JSONB,
    "operational_approach" TEXT NOT NULL,
    "operational_time_zone" TEXT NOT NULL,
    "retrospective_mode" TEXT NOT NULL,
    "facilitator_user_public_id" TEXT,
    "status" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "session_code" TEXT,
    "votes_per_participant" INTEGER NOT NULL,
    "allow_multiple_votes_per_topic" BOOLEAN NOT NULL,
    "default_contribution_visibility" TEXT NOT NULL,
    "goal_summary" TEXT,
    "summary" TEXT,
    "agreements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "participant_user_public_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "participant_with_contribution_user_public_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "participant_count" INTEGER NOT NULL DEFAULT 0,
    "participant_with_contribution_count" INTEGER NOT NULL DEFAULT 0,
    "contribution_count" INTEGER NOT NULL DEFAULT 0,
    "topic_count" INTEGER NOT NULL DEFAULT 0,
    "vote_record_count" INTEGER NOT NULL DEFAULT 0,
    "session_vote_sticker_total" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "transcript_after_close" JSONB,
    "additive_notes_after_close" JSONB NOT NULL DEFAULT '[]',
    "context_hints" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guided_retrospective_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guided_retrospective_topics" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "session_id" UUID NOT NULL,
    "session_public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "vote_count" INTEGER NOT NULL DEFAULT 0,
    "vote_sticker_total" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_public_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guided_retrospective_topics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guided_retrospective_contributions" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "session_id" UUID NOT NULL,
    "session_public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "author_user_public_id" TEXT NOT NULL,
    "author_guest_label" TEXT,
    "visibility_mode" TEXT NOT NULL,
    "template_column_key" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "topic_id" UUID,
    "topic_public_id" TEXT,
    "topic_status" TEXT NOT NULL,
    "vote_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guided_retrospective_contributions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guided_retrospective_votes" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "session_id" UUID NOT NULL,
    "session_public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "topic_id" UUID NOT NULL,
    "topic_public_id" TEXT NOT NULL,
    "user_public_id" TEXT NOT NULL,
    "sticker_weight" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guided_retrospective_votes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guided_retrospective_action_items" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "session_id" UUID NOT NULL,
    "session_public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "owner_user_public_id" TEXT,
    "due_date" TEXT,
    "priority" TEXT NOT NULL,
    "source_contribution_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source_topic_public_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL,
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guided_retrospective_action_items_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "daily_alignment_sessions_public_id_key" ON "daily_alignment_sessions"("public_id");
CREATE UNIQUE INDEX "daily_alignment_sessions_workspace_id_project_id_session_date_session_slot_key" ON "daily_alignment_sessions"("workspace_id", "project_id", "session_date", "session_slot");
CREATE INDEX "daily_alignment_sessions_project_updated_idx" ON "daily_alignment_sessions"("workspace_id", "project_id", "updated_at");

CREATE UNIQUE INDEX "daily_alignment_participant_updates_public_id_key" ON "daily_alignment_participant_updates"("public_id");
CREATE UNIQUE INDEX "daily_alignment_participant_updates_session_id_user_public_id_key" ON "daily_alignment_participant_updates"("session_id", "user_public_id");

CREATE UNIQUE INDEX "guided_refinement_sessions_public_id_key" ON "guided_refinement_sessions"("public_id");
CREATE UNIQUE INDEX "guided_refinement_sessions_workspace_id_project_id_session_date_session_slot_key" ON "guided_refinement_sessions"("workspace_id", "project_id", "session_date", "session_slot");
CREATE INDEX "guided_refinement_sessions_project_updated_idx" ON "guided_refinement_sessions"("workspace_id", "project_id", "updated_at");

CREATE UNIQUE INDEX "guided_refinement_reviewed_items_public_id_key" ON "guided_refinement_reviewed_items"("public_id");
CREATE UNIQUE INDEX "guided_refinement_reviewed_items_workspace_id_project_id_session_id_work_item_id_key" ON "guided_refinement_reviewed_items"("workspace_id", "project_id", "session_id", "work_item_id");
CREATE INDEX "guided_refinement_reviewed_items_lookup_idx" ON "guided_refinement_reviewed_items"("workspace_id", "project_id", "work_item_id", "session_date", "updated_at");

CREATE UNIQUE INDEX "guided_review_sessions_public_id_key" ON "guided_review_sessions"("public_id");
CREATE UNIQUE INDEX "guided_review_sessions_workspace_id_project_id_session_date_session_slot_key" ON "guided_review_sessions"("workspace_id", "project_id", "session_date", "session_slot");
CREATE INDEX "guided_review_sessions_project_updated_idx" ON "guided_review_sessions"("workspace_id", "project_id", "updated_at");

CREATE UNIQUE INDEX "guided_review_demonstrated_items_public_id_key" ON "guided_review_demonstrated_items"("public_id");
CREATE UNIQUE INDEX "guided_review_demonstrated_items_workspace_id_project_id_session_id_work_item_id_key" ON "guided_review_demonstrated_items"("workspace_id", "project_id", "session_id", "work_item_id");
CREATE INDEX "guided_review_demonstrated_items_lookup_idx" ON "guided_review_demonstrated_items"("workspace_id", "project_id", "work_item_id", "session_date");

CREATE UNIQUE INDEX "guided_review_feedback_entries_public_id_key" ON "guided_review_feedback_entries"("public_id");
CREATE INDEX "guided_review_feedback_entries_session_created_idx" ON "guided_review_feedback_entries"("workspace_id", "project_id", "session_id", "created_at");

CREATE UNIQUE INDEX "guided_retrospective_sessions_public_id_key" ON "guided_retrospective_sessions"("public_id");
CREATE UNIQUE INDEX "guided_retrospective_sessions_workspace_id_project_id_session_date_session_slot_key" ON "guided_retrospective_sessions"("workspace_id", "project_id", "session_date", "session_slot");
CREATE INDEX "guided_retrospective_sessions_project_updated_idx" ON "guided_retrospective_sessions"("workspace_id", "project_id", "updated_at");

CREATE UNIQUE INDEX "guided_retrospective_sessions_open_session_code_key"
  ON "guided_retrospective_sessions"("workspace_id", "session_code")
  WHERE "session_code" IS NOT NULL AND "status" IN ('planned', 'open', 'collecting', 'voting', 'closing');

CREATE UNIQUE INDEX "guided_retrospective_topics_public_id_key" ON "guided_retrospective_topics"("public_id");
CREATE INDEX "guided_retrospective_topics_session_idx" ON "guided_retrospective_topics"("workspace_id", "project_id", "session_id");

CREATE UNIQUE INDEX "guided_retrospective_contributions_public_id_key" ON "guided_retrospective_contributions"("public_id");
CREATE INDEX "guided_retrospective_contributions_session_idx" ON "guided_retrospective_contributions"("workspace_id", "project_id", "session_id");

CREATE UNIQUE INDEX "guided_retrospective_votes_public_id_key" ON "guided_retrospective_votes"("public_id");
CREATE UNIQUE INDEX "guided_retrospective_votes_workspace_id_project_id_session_id_user_public_id_topic_id_key" ON "guided_retrospective_votes"("workspace_id", "project_id", "session_id", "user_public_id", "topic_id");

CREATE UNIQUE INDEX "guided_retrospective_action_items_public_id_key" ON "guided_retrospective_action_items"("public_id");
CREATE INDEX "guided_retrospective_action_items_session_idx" ON "guided_retrospective_action_items"("workspace_id", "project_id", "session_id");
CREATE INDEX "guided_retrospective_action_items_project_updated_idx" ON "guided_retrospective_action_items"("workspace_id", "project_id", "updated_at");

-- Foreign keys
ALTER TABLE "daily_alignment_sessions" ADD CONSTRAINT "daily_alignment_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_alignment_sessions" ADD CONSTRAINT "daily_alignment_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_alignment_sessions" ADD CONSTRAINT "daily_alignment_sessions_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "sprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "daily_alignment_participant_updates" ADD CONSTRAINT "daily_alignment_participant_updates_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "daily_alignment_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_alignment_participant_updates" ADD CONSTRAINT "daily_alignment_participant_updates_user_public_id_fkey" FOREIGN KEY ("user_public_id") REFERENCES "identity_users"("public_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "guided_refinement_sessions" ADD CONSTRAINT "guided_refinement_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guided_refinement_sessions" ADD CONSTRAINT "guided_refinement_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guided_refinement_sessions" ADD CONSTRAINT "guided_refinement_sessions_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "sprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "guided_refinement_reviewed_items" ADD CONSTRAINT "guided_refinement_reviewed_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "guided_refinement_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guided_refinement_reviewed_items" ADD CONSTRAINT "guided_refinement_reviewed_items_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guided_review_sessions" ADD CONSTRAINT "guided_review_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guided_review_sessions" ADD CONSTRAINT "guided_review_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guided_review_sessions" ADD CONSTRAINT "guided_review_sessions_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "sprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "guided_review_demonstrated_items" ADD CONSTRAINT "guided_review_demonstrated_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "guided_review_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guided_review_demonstrated_items" ADD CONSTRAINT "guided_review_demonstrated_items_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guided_review_feedback_entries" ADD CONSTRAINT "guided_review_feedback_entries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "guided_review_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guided_review_feedback_entries" ADD CONSTRAINT "guided_review_feedback_entries_created_by_user_public_id_fkey" FOREIGN KEY ("created_by_user_public_id") REFERENCES "identity_users"("public_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "guided_retrospective_sessions" ADD CONSTRAINT "guided_retrospective_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guided_retrospective_sessions" ADD CONSTRAINT "guided_retrospective_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guided_retrospective_sessions" ADD CONSTRAINT "guided_retrospective_sessions_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "sprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "guided_retrospective_topics" ADD CONSTRAINT "guided_retrospective_topics_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "guided_retrospective_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guided_retrospective_topics" ADD CONSTRAINT "guided_retrospective_topics_created_by_user_public_id_fkey" FOREIGN KEY ("created_by_user_public_id") REFERENCES "identity_users"("public_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "guided_retrospective_contributions" ADD CONSTRAINT "guided_retrospective_contributions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "guided_retrospective_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guided_retrospective_contributions" ADD CONSTRAINT "guided_retrospective_contributions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "guided_retrospective_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "guided_retrospective_votes" ADD CONSTRAINT "guided_retrospective_votes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "guided_retrospective_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guided_retrospective_votes" ADD CONSTRAINT "guided_retrospective_votes_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "guided_retrospective_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guided_retrospective_votes" ADD CONSTRAINT "guided_retrospective_votes_user_public_id_fkey" FOREIGN KEY ("user_public_id") REFERENCES "identity_users"("public_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "guided_retrospective_action_items" ADD CONSTRAINT "guided_retrospective_action_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "guided_retrospective_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guided_retrospective_action_items" ADD CONSTRAINT "guided_retrospective_action_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guided_retrospective_action_items" ADD CONSTRAINT "guided_retrospective_action_items_owner_user_public_id_fkey" FOREIGN KEY ("owner_user_public_id") REFERENCES "identity_users"("public_id") ON DELETE SET NULL ON UPDATE CASCADE;
