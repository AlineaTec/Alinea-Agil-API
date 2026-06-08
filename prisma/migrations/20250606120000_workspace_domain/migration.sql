-- Fase 2: dominio workspace y organización.

-- CreateEnum
CREATE TYPE "workspace_owner_membership_role" AS ENUM ('owner');
CREATE TYPE "workspace_member_status" AS ENUM ('pending', 'active', 'active_without_seat', 'deactivated');
CREATE TYPE "workspace_invitation_status" AS ENUM ('pending', 'accepted', 'expired', 'revoked', 'superseded');
CREATE TYPE "work_team_status" AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE "workspace_billing_cadence" AS ENUM ('monthly', 'annual');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "modality" TEXT NOT NULL,
    "billing_cadence" "workspace_billing_cadence",
    "source_registration_intent_public_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspace_owner_memberships" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_public_id" TEXT NOT NULL,
    "role" "workspace_owner_membership_role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_owner_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspace_members" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "user_public_id" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "status" "workspace_member_status" NOT NULL,
    "has_seat_assigned" BOOLEAN NOT NULL,
    "workspace_role_administrative" TEXT,
    "workspace_role_methodological" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspace_invitations" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "full_name_proposed" TEXT NOT NULL,
    "workspace_role_administrative" TEXT,
    "workspace_role_methodological" TEXT,
    "assign_seat_proposal" BOOLEAN NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "workspace_invitation_status" NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "invited_by_user_public_id" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "superseded_by_invitation_public_id" TEXT,
    "email_comms_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspace_licenses" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "seats_purchased" INTEGER NOT NULL,
    "seats_assigned" INTEGER NOT NULL,
    "pending_reduction_target_purchased" INTEGER,
    "pending_reduction_applies_on" TIMESTAMP(3),
    "next_renewal_date" TIMESTAMP(3) NOT NULL,
    "last_renewal_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_licenses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_teams" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "description" TEXT,
    "status" "work_team_status" NOT NULL,
    "team_lead_user_public_id" TEXT,
    "target_size" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_teams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_team_memberships" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "team_id" UUID NOT NULL,
    "team_public_id" TEXT NOT NULL,
    "user_public_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL,
    "left_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_team_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_team_project_links" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "team_id" UUID NOT NULL,
    "team_public_id" TEXT NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_team_project_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_public_id_key" ON "workspaces"("public_id");
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");
CREATE INDEX "workspaces_source_registration_intent_public_id_idx" ON "workspaces"("source_registration_intent_public_id");

CREATE UNIQUE INDEX "workspace_owner_memberships_public_id_key" ON "workspace_owner_memberships"("public_id");
CREATE INDEX "workspace_owner_memberships_user_public_id_idx" ON "workspace_owner_memberships"("user_public_id");
CREATE UNIQUE INDEX "workspace_owner_memberships_workspace_id_user_public_id_key" ON "workspace_owner_memberships"("workspace_id", "user_public_id");

CREATE UNIQUE INDEX "workspace_members_public_id_key" ON "workspace_members"("public_id");
CREATE INDEX "workspace_members_user_public_id_idx" ON "workspace_members"("user_public_id");
CREATE UNIQUE INDEX "workspace_members_workspace_id_email_normalized_key" ON "workspace_members"("workspace_id", "email_normalized");
CREATE UNIQUE INDEX "workspace_members_workspace_id_user_public_id_key" ON "workspace_members"("workspace_id", "user_public_id");

CREATE UNIQUE INDEX "workspace_invitations_public_id_key" ON "workspace_invitations"("public_id");
CREATE UNIQUE INDEX "workspace_invitations_token_hash_key" ON "workspace_invitations"("token_hash");
CREATE INDEX "workspace_invitations_workspace_id_email_normalized_idx" ON "workspace_invitations"("workspace_id", "email_normalized");
CREATE INDEX "workspace_invitations_workspace_id_status_idx" ON "workspace_invitations"("workspace_id", "status");
CREATE INDEX "workspace_invitations_expires_at_idx" ON "workspace_invitations"("expires_at");

CREATE UNIQUE INDEX "workspace_licenses_workspace_id_key" ON "workspace_licenses"("workspace_id");
CREATE UNIQUE INDEX "workspace_licenses_workspace_public_id_key" ON "workspace_licenses"("workspace_public_id");

CREATE UNIQUE INDEX "work_teams_public_id_key" ON "work_teams"("public_id");
CREATE INDEX "work_teams_workspace_public_id_idx" ON "work_teams"("workspace_public_id");
CREATE UNIQUE INDEX "work_teams_workspace_id_name_normalized_key" ON "work_teams"("workspace_id", "name_normalized");

CREATE UNIQUE INDEX "work_team_memberships_public_id_key" ON "work_team_memberships"("public_id");
CREATE INDEX "work_team_memberships_team_id_is_active_idx" ON "work_team_memberships"("team_id", "is_active");
CREATE INDEX "work_team_memberships_workspace_id_user_public_id_idx" ON "work_team_memberships"("workspace_id", "user_public_id");

CREATE UNIQUE INDEX "work_team_project_links_public_id_key" ON "work_team_project_links"("public_id");
CREATE UNIQUE INDEX "work_team_project_links_team_id_project_public_id_key" ON "work_team_project_links"("team_id", "project_public_id");
CREATE INDEX "work_team_project_links_workspace_id_project_public_id_idx" ON "work_team_project_links"("workspace_id", "project_public_id");

-- Partial unique indexes (equivalente a Mongo partialFilterExpression)
CREATE UNIQUE INDEX "workspace_invitations_pending_workspace_email_key"
ON "workspace_invitations"("workspace_id", "email_normalized")
WHERE "status" = 'pending';

CREATE UNIQUE INDEX "work_team_memberships_active_team_user_key"
ON "work_team_memberships"("team_id", "user_public_id")
WHERE "is_active" = true;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_source_registration_intent_public_id_fkey" FOREIGN KEY ("source_registration_intent_public_id") REFERENCES "identity_registration_intents"("public_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workspace_owner_memberships" ADD CONSTRAINT "workspace_owner_memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_owner_memberships" ADD CONSTRAINT "workspace_owner_memberships_user_public_id_fkey" FOREIGN KEY ("user_public_id") REFERENCES "identity_users"("public_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_public_id_fkey" FOREIGN KEY ("user_public_id") REFERENCES "identity_users"("public_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_licenses" ADD CONSTRAINT "workspace_licenses_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_teams" ADD CONSTRAINT "work_teams_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_team_memberships" ADD CONSTRAINT "work_team_memberships_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "work_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_team_project_links" ADD CONSTRAINT "work_team_project_links_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "work_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
