-- Relational hardening: kanban_columns, FKs, projects list index.
-- Partial indexes from prior migrations remain in SQL only; see prisma/migrations/README-PARTIAL-INDEXES.md

-- -----------------------------------------------------------------------------
-- A1: kanban_columns + work_items.kanban_column_id
-- -----------------------------------------------------------------------------

CREATE TABLE "kanban_columns" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "kanban_flow_config_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workspace_public_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_public_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "wip_limit" INTEGER,
    "policy_text" TEXT NOT NULL DEFAULT '',
    "wip_enforcement" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kanban_columns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kanban_columns_kanban_flow_config_id_public_id_key"
  ON "kanban_columns"("kanban_flow_config_id", "public_id");
CREATE UNIQUE INDEX "kanban_columns_kanban_flow_config_id_position_key"
  ON "kanban_columns"("kanban_flow_config_id", "position");
CREATE INDEX "kanban_columns_project_public_id_idx"
  ON "kanban_columns"("project_id", "public_id");

-- Migrate columns from flow_definition JSON (camelCase keys from runtime)
INSERT INTO "kanban_columns" (
    "id",
    "public_id",
    "kanban_flow_config_id",
    "workspace_id",
    "workspace_public_id",
    "project_id",
    "project_public_id",
    "name",
    "position",
    "wip_limit",
    "policy_text",
    "wip_enforcement",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    COALESCE(col->>'columnPublicId', col->>'column_public_id'),
    kfc."id",
    kfc."workspace_id",
    kfc."workspace_public_id",
    kfc."project_id",
    kfc."project_public_id",
    COALESCE(col->>'name', ''),
    COALESCE((col->>'position')::int, 0),
    CASE
        WHEN col->'wipLimit' IS NULL OR col->'wipLimit' = 'null'::jsonb THEN NULL
        ELSE (col->>'wipLimit')::int
    END,
    COALESCE(col->>'policyText', col->>'policy_text', ''),
    COALESCE(
        col->>'wipEnforcement',
        col->>'wip_enforcement',
        'informational'
    ),
    kfc."created_at",
    kfc."updated_at"
FROM "kanban_flow_configs" kfc
CROSS JOIN LATERAL jsonb_array_elements(
    CASE
        WHEN jsonb_typeof(kfc."flow_definition"->'columns') = 'array'
        THEN kfc."flow_definition"->'columns'
        ELSE '[]'::jsonb
    END
) AS col
WHERE COALESCE(col->>'columnPublicId', col->>'column_public_id') IS NOT NULL
  AND COALESCE(col->>'columnPublicId', col->>'column_public_id') <> '';

UPDATE "kanban_flow_configs"
SET "flow_definition" = '{"schemaVersion":2}'::jsonb
WHERE jsonb_typeof("flow_definition"->'columns') = 'array';

ALTER TABLE "work_items" ADD COLUMN "kanban_column_id" UUID;

UPDATE "work_items" wi
SET "kanban_column_id" = kc."id"
FROM "kanban_columns" kc
WHERE wi."kanban_column_public_id" IS NOT NULL
  AND wi."kanban_column_public_id" = kc."public_id"
  AND wi."project_id" = kc."project_id";

CREATE INDEX "work_items_kanban_column_id_sort_idx"
  ON "work_items"("workspace_id", "project_id", "kanban_column_id", "parent_item_id", "sort_order");

ALTER TABLE "kanban_columns" ADD CONSTRAINT "kanban_columns_kanban_flow_config_id_fkey"
  FOREIGN KEY ("kanban_flow_config_id") REFERENCES "kanban_flow_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kanban_columns" ADD CONSTRAINT "kanban_columns_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kanban_columns" ADD CONSTRAINT "kanban_columns_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_items" ADD CONSTRAINT "work_items_kanban_column_id_fkey"
  FOREIGN KEY ("kanban_column_id") REFERENCES "kanban_columns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- A2: work_controls_override_tokens.work_item_id
-- -----------------------------------------------------------------------------

ALTER TABLE "work_controls_override_tokens" ADD COLUMN "work_item_id" UUID;

UPDATE "work_controls_override_tokens" t
SET "work_item_id" = wi."id"
FROM "work_items" wi
WHERE t."work_item_public_id" = wi."public_id"
  AND t."project_id" = wi."project_id";

DELETE FROM "work_controls_override_tokens" WHERE "work_item_id" IS NULL;

ALTER TABLE "work_controls_override_tokens" ALTER COLUMN "work_item_id" SET NOT NULL;

CREATE INDEX "work_controls_override_tokens_work_item_id_idx"
  ON "work_controls_override_tokens"("work_item_id");

ALTER TABLE "work_controls_override_tokens" ADD CONSTRAINT "work_controls_override_tokens_work_item_id_fkey"
  FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- A3: project_impediments.sprint_id
-- -----------------------------------------------------------------------------

ALTER TABLE "project_impediments" ADD COLUMN "sprint_id" UUID;

UPDATE "project_impediments" pi
SET "sprint_id" = s."id"
FROM "sprints" s
WHERE pi."related_sprint_public_id" IS NOT NULL
  AND pi."related_sprint_public_id" = s."public_id"
  AND pi."project_id" = s."project_id";

ALTER TABLE "project_impediments" ADD CONSTRAINT "project_impediments_sprint_id_fkey"
  FOREIGN KEY ("sprint_id") REFERENCES "sprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- A4: platform_tenants.workspace_id
-- -----------------------------------------------------------------------------

ALTER TABLE "platform_tenants" ADD COLUMN "workspace_id" UUID;

UPDATE "platform_tenants" pt
SET "workspace_id" = w."id"
FROM "workspaces" w
WHERE pt."workspace_public_id" = w."public_id";

DELETE FROM "platform_tenants" WHERE "workspace_id" IS NULL;

ALTER TABLE "platform_tenants" ALTER COLUMN "workspace_id" SET NOT NULL;

CREATE UNIQUE INDEX "platform_tenants_workspace_id_key" ON "platform_tenants"("workspace_id");

ALTER TABLE "platform_tenants" ADD CONSTRAINT "platform_tenants_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- A5: projects list index
-- -----------------------------------------------------------------------------

CREATE INDEX "projects_workspace_updated_idx"
  ON "projects"("workspace_id", "updated_at" DESC);

-- -----------------------------------------------------------------------------
-- B1: work_items.completed_in_sprint_id
-- -----------------------------------------------------------------------------

ALTER TABLE "work_items" ADD COLUMN "completed_in_sprint_id" UUID;

UPDATE "work_items" wi
SET "completed_in_sprint_id" = s."id"
FROM "sprints" s
WHERE wi."completed_in_sprint_public_id" IS NOT NULL
  AND wi."completed_in_sprint_public_id" = s."public_id"
  AND wi."project_id" = s."project_id";

ALTER TABLE "work_items" ADD CONSTRAINT "work_items_completed_in_sprint_id_fkey"
  FOREIGN KEY ("completed_in_sprint_id") REFERENCES "sprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;
