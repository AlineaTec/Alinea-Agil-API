-- Fase 14 — NBA snooze + platform audit

-- CreateTable
CREATE TABLE "project_operating_snapshot_nba_snoozes" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "user_public_id" TEXT NOT NULL,
    "snooze_key" TEXT NOT NULL,
    "snoozed_until_operational_date" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_operating_snapshot_nba_snoozes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_events" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "actor_platform_user_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_platform_user_id" TEXT,
    "target_platform_tenant_id" TEXT,
    "workspace_public_id" TEXT,
    "summary" TEXT NOT NULL,
    "payload_before" JSONB,
    "payload_after" JSONB,

    CONSTRAINT "platform_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_operating_snapshot_nba_snoozes_public_id_key" ON "project_operating_snapshot_nba_snoozes"("public_id");
CREATE UNIQUE INDEX "nba_snooze_user_project_key" ON "project_operating_snapshot_nba_snoozes"("workspace_id", "project_id", "user_public_id", "snooze_key");
CREATE INDEX "project_operating_snapshot_nba_snoozes_lookup_idx" ON "project_operating_snapshot_nba_snoozes"("workspace_public_id", "project_public_id", "user_public_id", "snoozed_until_operational_date");

CREATE UNIQUE INDEX "platform_audit_events_public_id_key" ON "platform_audit_events"("public_id");
CREATE INDEX "platform_audit_events_occurred_at_idx" ON "platform_audit_events"("occurred_at" DESC);
CREATE INDEX "platform_audit_events_target_user_occurred_idx" ON "platform_audit_events"("target_platform_user_id", "occurred_at" DESC);
CREATE INDEX "platform_audit_events_target_tenant_occurred_idx" ON "platform_audit_events"("target_platform_tenant_id", "occurred_at" DESC);
CREATE INDEX "platform_audit_events_workspace_occurred_idx" ON "platform_audit_events"("workspace_public_id", "occurred_at" DESC);
CREATE INDEX "platform_audit_events_actor_occurred_idx" ON "platform_audit_events"("actor_platform_user_id", "occurred_at" DESC);

-- AddForeignKey
ALTER TABLE "project_operating_snapshot_nba_snoozes" ADD CONSTRAINT "project_operating_snapshot_nba_snoozes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_operating_snapshot_nba_snoozes" ADD CONSTRAINT "project_operating_snapshot_nba_snoozes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
