-- Fase 12 — billing + audit operativa

-- CreateTable
CREATE TABLE "billing_workspace_snapshots" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "billing_source" TEXT NOT NULL,
    "subscription_external_id" TEXT,
    "plan_key" TEXT NOT NULL,
    "included_seats" INTEGER NOT NULL,
    "additional_paid_seats" INTEGER NOT NULL,
    "current_entitled_seats" INTEGER NOT NULL,
    "scheduled_entitled_seats" INTEGER,
    "scheduled_seat_change_effective_at" TIMESTAMP(3),
    "paddle_scheduled_entitled_seats" INTEGER,
    "paddle_scheduled_seat_change_effective_at" TIMESTAMP(3),
    "billing_status" TEXT NOT NULL,
    "grace_period_starts_at" TIMESTAMP(3),
    "grace_period_ends_at" TIMESTAMP(3),
    "suspension_effective_at" TIMESTAMP(3),
    "peak_usage_in_billing_period" INTEGER NOT NULL DEFAULT 0,
    "max_concurrent_active_users" INTEGER NOT NULL DEFAULT 0,
    "billing_cycle_anchor" TIMESTAMP(3),
    "current_period_starts_at" TIMESTAMP(3),
    "current_period_ends_at" TIMESTAMP(3),
    "last_commercial_sync_at" TIMESTAMP(3),
    "commercial_external_snapshot" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_workspace_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_paddle_webhook_processed_events" (
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_paddle_webhook_processed_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "billing_notification_sends" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_notification_sends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_workspace_audit_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_workspace_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_workspace_receipts" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "billing_source" TEXT NOT NULL,
    "payment_provider" TEXT NOT NULL,
    "provider_transaction_id" TEXT NOT NULL,
    "provider_subscription_id" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "currency_code" TEXT NOT NULL,
    "amount_paid_minor" TEXT NOT NULL,
    "subtotal_minor" TEXT,
    "tax_amount_minor" TEXT,
    "customer_name" TEXT NOT NULL,
    "customer_email" TEXT,
    "workspace_name" TEXT NOT NULL,
    "plan_kind" TEXT NOT NULL,
    "billing_cadence" TEXT,
    "included_seats" INTEGER NOT NULL,
    "additional_seats" INTEGER NOT NULL,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "document_format" TEXT NOT NULL,
    "pdf_storage_key" TEXT,
    "pdf_generated_at" TIMESTAMP(3),
    "email_sent_at" TIMESTAMP(3),
    "source_event_id" TEXT,
    "source_event_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_workspace_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_receipt_year_sequences" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payment_receipt_year_sequences_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "payment_receipt_orphan_events" (
    "id" UUID NOT NULL,
    "payment_provider" TEXT NOT NULL,
    "provider_transaction_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_receipt_orphan_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_audit_events" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_user_public_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "resource_project_public_id" TEXT NOT NULL,
    "resource_backlog_item_public_id" TEXT,
    "previous_value" JSONB,
    "next_value" JSONB NOT NULL,

    CONSTRAINT "workspace_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_impediment_audit_events" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "impediment_public_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_user_public_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "payload_before" JSONB,
    "payload_after" JSONB,

    CONSTRAINT "project_impediment_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_controls_audit_events" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_public_id" TEXT,
    "event" TEXT NOT NULL,
    "actor_user_public_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "work_controls_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_team_audit_events" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "team_public_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_user_public_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "payload_before" JSONB,
    "payload_after" JSONB,

    CONSTRAINT "work_team_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_workspace_snapshots_workspace_id_key" ON "billing_workspace_snapshots"("workspace_id");
CREATE UNIQUE INDEX "billing_workspace_snapshots_workspace_public_id_key" ON "billing_workspace_snapshots"("workspace_public_id");
CREATE INDEX "billing_workspace_snapshots_subscription_external_id_idx" ON "billing_workspace_snapshots"("subscription_external_id");
CREATE INDEX "billing_workspace_snapshots_billing_status_grace_period_ends_at_idx" ON "billing_workspace_snapshots"("billing_status", "grace_period_ends_at");

CREATE UNIQUE INDEX "billing_notification_sends_workspace_id_kind_dedupe_key_key" ON "billing_notification_sends"("workspace_id", "kind", "dedupe_key");
CREATE INDEX "billing_notification_sends_workspace_public_id_sent_at_idx" ON "billing_notification_sends"("workspace_public_id", "sent_at" DESC);

CREATE INDEX "billing_workspace_audit_events_workspace_public_id_created_at_idx" ON "billing_workspace_audit_events"("workspace_public_id", "created_at" DESC);
CREATE INDEX "billing_workspace_audit_events_workspace_public_id_event_type_c_idx" ON "billing_workspace_audit_events"("workspace_public_id", "event_type", "created_at" DESC);

CREATE UNIQUE INDEX "payment_workspace_receipts_public_id_key" ON "payment_workspace_receipts"("public_id");
CREATE UNIQUE INDEX "payment_workspace_receipts_receipt_number_key" ON "payment_workspace_receipts"("receipt_number");
CREATE UNIQUE INDEX "payment_workspace_receipts_payment_provider_provider_transact_key" ON "payment_workspace_receipts"("payment_provider", "provider_transaction_id");
CREATE INDEX "payment_workspace_receipts_workspace_public_id_issued_at_publ_idx" ON "payment_workspace_receipts"("workspace_public_id", "issued_at" DESC, "public_id" DESC);

CREATE INDEX "payment_receipt_orphan_events_payment_provider_provider_trans_idx" ON "payment_receipt_orphan_events"("payment_provider", "provider_transaction_id");

CREATE UNIQUE INDEX "workspace_audit_events_public_id_key" ON "workspace_audit_events"("public_id");
CREATE INDEX "workspace_audit_events_project_occurred_idx" ON "workspace_audit_events"("workspace_id", "resource_project_public_id", "occurred_at");
CREATE INDEX "workspace_audit_events_project_cat_occurred_idx" ON "workspace_audit_events"("workspace_id", "resource_project_public_id", "category", "occurred_at");

CREATE UNIQUE INDEX "project_impediment_audit_events_public_id_key" ON "project_impediment_audit_events"("public_id");
CREATE INDEX "project_impediment_audit_events_workspace_public_id_project_p_idx" ON "project_impediment_audit_events"("workspace_public_id", "project_public_id", "impediment_public_id", "occurred_at" DESC);

CREATE UNIQUE INDEX "work_controls_audit_events_public_id_key" ON "work_controls_audit_events"("public_id");
CREATE INDEX "work_controls_audit_events_workspace_public_id_occurred_at_idx" ON "work_controls_audit_events"("workspace_public_id", "occurred_at" DESC);

CREATE UNIQUE INDEX "work_team_audit_events_public_id_key" ON "work_team_audit_events"("public_id");
CREATE INDEX "work_team_audit_events_workspace_public_id_team_public_id_occ_idx" ON "work_team_audit_events"("workspace_public_id", "team_public_id", "occurred_at" DESC);

-- AddForeignKey
ALTER TABLE "billing_workspace_snapshots" ADD CONSTRAINT "billing_workspace_snapshots_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_notification_sends" ADD CONSTRAINT "billing_notification_sends_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_workspace_audit_events" ADD CONSTRAINT "billing_workspace_audit_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_workspace_receipts" ADD CONSTRAINT "payment_workspace_receipts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_audit_events" ADD CONSTRAINT "workspace_audit_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_impediment_audit_events" ADD CONSTRAINT "project_impediment_audit_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_team_audit_events" ADD CONSTRAINT "work_team_audit_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
