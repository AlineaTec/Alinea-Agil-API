-- Fase 15 — platform users / access / tenants

CREATE TABLE "platform_users" (
    "id" UUID NOT NULL,
    "platform_user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mfa_status" TEXT NOT NULL,
    "mfa_totp_secret_base32" TEXT,
    "mfa_failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "mfa_locked_until" TIMESTAMP(3),
    "invitation_nonce_hash" TEXT,
    "password_salt" TEXT,
    "password_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_access_sessions" (
    "id" UUID NOT NULL,
    "session_public_id" TEXT NOT NULL,
    "platform_user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_access_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_password_reset_tokens" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "platform_user_id" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_tenants" (
    "id" UUID NOT NULL,
    "platform_tenant_id" TEXT NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_tenants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_users_platform_user_id_key" ON "platform_users"("platform_user_id");
CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users"("email");

CREATE UNIQUE INDEX "platform_access_sessions_session_public_id_key" ON "platform_access_sessions"("session_public_id");
CREATE INDEX "platform_access_sessions_token_hash_idx" ON "platform_access_sessions"("token_hash");
CREATE INDEX "platform_access_sessions_platform_user_id_idx" ON "platform_access_sessions"("platform_user_id");
CREATE INDEX "platform_access_sessions_expires_at_idx" ON "platform_access_sessions"("expires_at");

CREATE UNIQUE INDEX "platform_password_reset_tokens_token_hash_key" ON "platform_password_reset_tokens"("token_hash");
CREATE INDEX "platform_password_reset_tokens_platform_user_id_idx" ON "platform_password_reset_tokens"("platform_user_id");
CREATE INDEX "platform_password_reset_tokens_expires_at_idx" ON "platform_password_reset_tokens"("expires_at");

CREATE UNIQUE INDEX "platform_tenants_platform_tenant_id_key" ON "platform_tenants"("platform_tenant_id");
CREATE UNIQUE INDEX "platform_tenants_workspace_public_id_key" ON "platform_tenants"("workspace_public_id");

ALTER TABLE "platform_access_sessions" ADD CONSTRAINT "platform_access_sessions_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("platform_user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_password_reset_tokens" ADD CONSTRAINT "platform_password_reset_tokens_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("platform_user_id") ON DELETE CASCADE ON UPDATE CASCADE;
