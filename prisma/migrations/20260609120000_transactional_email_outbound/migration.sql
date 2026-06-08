-- Fase 16 — transactional email outbound ledger

CREATE TABLE "transactional_email_outbound_messages" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "to_normalized" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "provider_message_id" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactional_email_outbound_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transactional_email_outbound_messages_public_id_key" ON "transactional_email_outbound_messages"("public_id");
CREATE INDEX "transactional_email_outbound_messages_created_at_idx" ON "transactional_email_outbound_messages"("created_at" DESC);
CREATE INDEX "transactional_email_outbound_messages_template_key_idx" ON "transactional_email_outbound_messages"("template_key");
CREATE INDEX "transactional_email_outbound_messages_to_normalized_idx" ON "transactional_email_outbound_messages"("to_normalized");
CREATE INDEX "transactional_email_outbound_messages_ok_idx" ON "transactional_email_outbound_messages"("ok");
