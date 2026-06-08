-- Fase 13 — product feedback (ideas, submissions, idea feedback, audit)

-- CreateTable
CREATE TABLE "product_ideas" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT,
    "area" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "is_feedback_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_feedback_submissions" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "user_public_id" TEXT NOT NULL,
    "submitter_display_name" TEXT NOT NULL,
    "submission_type" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "idea_public_id" TEXT,
    "module_key" TEXT,
    "route" TEXT NOT NULL,
    "screen_context" JSONB,
    "project_id" UUID,
    "project_public_id" TEXT,
    "operational_approach" TEXT,
    "source_surface" TEXT NOT NULL,
    "reaction" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "internal_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "internal_notes" TEXT,
    "misrouting_category" TEXT,
    "duplicate_of_submission_public_id" TEXT,
    "review_disposition" TEXT,
    "reviewed_by_platform_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_feedback_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_idea_feedback_entries" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "idea_public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID,
    "project_public_id" TEXT,
    "user_public_id" TEXT NOT NULL,
    "submitter_display_name" TEXT NOT NULL,
    "reaction" TEXT NOT NULL,
    "liked_what" TEXT NOT NULL,
    "could_improve_what" TEXT NOT NULL,
    "additional_comment" TEXT,
    "source_surface" TEXT NOT NULL,
    "review_status" TEXT NOT NULL DEFAULT 'new',
    "reviewed_by_platform_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "internal_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "internal_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_idea_feedback_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_feedback_audit_events" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "submission_public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actor_user_public_id" TEXT,
    "actor_platform_user_id" TEXT,
    "summary" TEXT NOT NULL,
    "payload_before" JSONB,
    "payload_after" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_feedback_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_idea_feedback_audit_events" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "feedback_public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actor_user_public_id" TEXT,
    "actor_platform_user_id" TEXT,
    "summary" TEXT NOT NULL,
    "payload_before" JSONB,
    "payload_after" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_idea_feedback_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_ideas_public_id_key" ON "product_ideas"("public_id");
CREATE INDEX "product_ideas_status_idx" ON "product_ideas"("status");
CREATE INDEX "product_ideas_area_idx" ON "product_ideas"("area");

CREATE UNIQUE INDEX "product_feedback_submissions_public_id_key" ON "product_feedback_submissions"("public_id");
CREATE INDEX "product_feedback_submissions_workspace_public_id_created_at_idx" ON "product_feedback_submissions"("workspace_public_id", "created_at" DESC);
CREATE INDEX "product_feedback_submissions_submission_type_idx" ON "product_feedback_submissions"("submission_type");
CREATE INDEX "product_feedback_submissions_status_idx" ON "product_feedback_submissions"("status");
CREATE INDEX "product_feedback_submissions_idea_public_id_idx" ON "product_feedback_submissions"("idea_public_id");
CREATE INDEX "product_feedback_submissions_module_key_idx" ON "product_feedback_submissions"("module_key");
CREATE INDEX "product_feedback_submissions_project_public_id_idx" ON "product_feedback_submissions"("project_public_id");
CREATE UNIQUE INDEX "pf_unique_user_idea_workspace" ON "product_feedback_submissions"("workspace_public_id", "idea_public_id", "user_public_id") WHERE "idea_public_id" IS NOT NULL;

CREATE UNIQUE INDEX "product_idea_feedback_entries_public_id_key" ON "product_idea_feedback_entries"("public_id");
CREATE UNIQUE INDEX "pif_unique_user_idea_ws" ON "product_idea_feedback_entries"("workspace_public_id", "idea_public_id", "user_public_id");
CREATE INDEX "product_idea_feedback_entries_workspace_public_id_created_at_idx" ON "product_idea_feedback_entries"("workspace_public_id", "created_at" DESC);
CREATE INDEX "product_idea_feedback_entries_review_status_idx" ON "product_idea_feedback_entries"("review_status");

CREATE UNIQUE INDEX "product_feedback_audit_events_public_id_key" ON "product_feedback_audit_events"("public_id");
CREATE INDEX "product_feedback_audit_events_submission_public_id_occurred_at_idx" ON "product_feedback_audit_events"("submission_public_id", "occurred_at");

CREATE UNIQUE INDEX "product_idea_feedback_audit_events_public_id_key" ON "product_idea_feedback_audit_events"("public_id");
CREATE INDEX "product_idea_feedback_audit_events_feedback_public_id_occurred_at_idx" ON "product_idea_feedback_audit_events"("feedback_public_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "product_feedback_submissions" ADD CONSTRAINT "product_feedback_submissions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_feedback_submissions" ADD CONSTRAINT "product_feedback_submissions_idea_public_id_fkey" FOREIGN KEY ("idea_public_id") REFERENCES "product_ideas"("public_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_feedback_submissions" ADD CONSTRAINT "product_feedback_submissions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_idea_feedback_entries" ADD CONSTRAINT "product_idea_feedback_entries_idea_public_id_fkey" FOREIGN KEY ("idea_public_id") REFERENCES "product_ideas"("public_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_idea_feedback_entries" ADD CONSTRAINT "product_idea_feedback_entries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_idea_feedback_entries" ADD CONSTRAINT "product_idea_feedback_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_feedback_audit_events" ADD CONSTRAINT "product_feedback_audit_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_idea_feedback_audit_events" ADD CONSTRAINT "product_idea_feedback_audit_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
