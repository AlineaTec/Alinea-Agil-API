-- Fase 1: dominio identity (usuarios, sesiones, reset, registro, verificación).

-- CreateEnum
CREATE TYPE "identity_registration_intent_status" AS ENUM (
  'EMAIL_COLLECTED',
  'EMAIL_VERIFIED',
  'MODALITY_SELECTED',
  'WORKSPACE_PROPOSED',
  'CREDENTIALS_SET',
  'PAYMENT_PENDING',
  'PAYMENT_FAILED',
  'PAYMENT_SUCCEEDED',
  'PROVISIONING',
  'ACTIVE',
  'EXPIRED',
  'ABANDONED'
);

CREATE TYPE "identity_verification_challenge_status" AS ENUM (
  'PENDING',
  'CONSUMED',
  'EXPIRED',
  'SUPERSEDED'
);

CREATE TYPE "identity_billing_cadence" AS ENUM ('monthly', 'annual');

-- CreateTable
CREATE TABLE "identity_registration_intents" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "status" "identity_registration_intent_status" NOT NULL,
    "modality" TEXT,
    "billing_cadence" "identity_billing_cadence",
    "team_seats_purchased" INTEGER,
    "workspace_display_name" TEXT,
    "workspace_code" TEXT,
    "account_full_name" TEXT,
    "password_hash" TEXT,
    "provisioned_user_public_id" TEXT,
    "provisioned_workspace_public_id" TEXT,
    "provisioned_at" TIMESTAMP(3),
    "plan_sku" TEXT,
    "payment_provider_ref" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_registration_intents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "identity_users" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "modality_at_signup" TEXT NOT NULL,
    "source_registration_intent_public_id" TEXT NOT NULL,
    "preferred_active_workspace_public_id" TEXT,
    "preferred_active_workspace_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "identity_auth_sessions" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "identity_password_reset_tokens" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "identity_verification_challenges" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "registration_intent_id" UUID NOT NULL,
    "registration_intent_public_id" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "status" "identity_verification_challenge_status" NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_verification_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "identity_registration_intents_public_id_key" ON "identity_registration_intents"("public_id");
CREATE INDEX "identity_registration_intents_email_normalized_idx" ON "identity_registration_intents"("email_normalized");
CREATE INDEX "identity_registration_intents_expires_at_idx" ON "identity_registration_intents"("expires_at");
CREATE INDEX "identity_registration_intents_provisioned_user_public_id_idx" ON "identity_registration_intents"("provisioned_user_public_id");
CREATE INDEX "identity_registration_intents_provisioned_workspace_public_id_idx" ON "identity_registration_intents"("provisioned_workspace_public_id");
CREATE UNIQUE INDEX "identity_registration_intents_workspace_code_key" ON "identity_registration_intents"("workspace_code");

CREATE UNIQUE INDEX "identity_users_public_id_key" ON "identity_users"("public_id");
CREATE UNIQUE INDEX "identity_users_email_normalized_key" ON "identity_users"("email_normalized");
CREATE INDEX "identity_users_source_registration_intent_public_id_idx" ON "identity_users"("source_registration_intent_public_id");

CREATE UNIQUE INDEX "identity_auth_sessions_public_id_key" ON "identity_auth_sessions"("public_id");
CREATE INDEX "identity_auth_sessions_user_id_idx" ON "identity_auth_sessions"("user_id");
CREATE INDEX "identity_auth_sessions_token_hash_idx" ON "identity_auth_sessions"("token_hash");
CREATE INDEX "identity_auth_sessions_expires_at_idx" ON "identity_auth_sessions"("expires_at");

CREATE UNIQUE INDEX "identity_password_reset_tokens_token_hash_key" ON "identity_password_reset_tokens"("token_hash");
CREATE INDEX "identity_password_reset_tokens_user_id_idx" ON "identity_password_reset_tokens"("user_id");
CREATE INDEX "identity_password_reset_tokens_expires_at_idx" ON "identity_password_reset_tokens"("expires_at");
CREATE INDEX "identity_password_reset_tokens_used_at_idx" ON "identity_password_reset_tokens"("used_at");

CREATE UNIQUE INDEX "identity_verification_challenges_public_id_key" ON "identity_verification_challenges"("public_id");
CREATE INDEX "identity_verification_challenges_registration_intent_id_idx" ON "identity_verification_challenges"("registration_intent_id");
CREATE INDEX "identity_verification_challenges_registration_intent_public_id_idx" ON "identity_verification_challenges"("registration_intent_public_id");
CREATE INDEX "identity_verification_challenges_email_normalized_idx" ON "identity_verification_challenges"("email_normalized");
CREATE INDEX "identity_verification_challenges_expires_at_idx" ON "identity_verification_challenges"("expires_at");

-- AddForeignKey
ALTER TABLE "identity_users" ADD CONSTRAINT "identity_users_source_registration_intent_public_id_fkey" FOREIGN KEY ("source_registration_intent_public_id") REFERENCES "identity_registration_intents"("public_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "identity_auth_sessions" ADD CONSTRAINT "identity_auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "identity_password_reset_tokens" ADD CONSTRAINT "identity_password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "identity_verification_challenges" ADD CONSTRAINT "identity_verification_challenges_registration_intent_id_fkey" FOREIGN KEY ("registration_intent_id") REFERENCES "identity_registration_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
