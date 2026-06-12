import { emptyMaterializationMeta } from "../../../modules/workspace-projects/domain/project-draft-materialization.js"
import { ProjectDraftPrismaRepository } from "../../../modules/workspace-projects/persistence/prisma/project-draft.prisma-repository.js"
import { ProjectRuntimePrismaRepository } from "../../../modules/workspace-project-runtime/persistence/prisma/project-runtime.prisma-repository.js"
import type { OperationalApproach } from "../../../modules/workspace-project-runtime/domain/operational-approach.js"
import { initialConfigurationSummaryAfterMaterialization } from "../../../modules/workspace-project-runtime/domain/initial-configuration-summary.js"
import type { SeedContext } from "./context.js"

export type ProjectSeedOptions = {
  workspacePublicId: string
  draftPublicId: string
  projectPublicId: string
  projectName: string
  approach: OperationalApproach
  createdByUserPublicId: string
}

export async function seedProject(
  ctx: SeedContext,
  opts: ProjectSeedOptions,
): Promise<void> {
  const drafts = new ProjectDraftPrismaRepository(ctx.prisma)
  const projects = new ProjectRuntimePrismaRepository(ctx.prisma)
  const now = ctx.now

  const existing = await projects.findByWorkspaceAndProjectPublicId(
    opts.workspacePublicId,
    opts.projectPublicId,
  )
  if (existing) {
    ctx.log(`Proyecto ya existe: ${opts.projectName}`)
    return
  }

  await drafts.insert({
    draftPublicId: opts.draftPublicId,
    workspacePublicId: opts.workspacePublicId,
    createdByUserPublicId: opts.createdByUserPublicId,
    status: "materialized",
    projectName: opts.projectName,
    charter: { name: opts.projectName, seed: true },
    methodologyAssessment: {
      teamMethodologicalMaturity: 3,
      controlTraceabilityComplianceNeed: 2,
      workNature: "product_delivery",
      uncertaintyLevel: 3,
      scopeStability: 3,
      changeAcceptance: 3,
      deliveryShape: "incremental_iterative",
      interruptionFrequency: 2,
      prioritizationType: "business_value",
    },
    recommendationResult: null,
    selectedApproach: opts.approach,
    wasRecommendationOverridden: null,
    overrideJustification: null,
    materializedProjectPublicId: opts.projectPublicId,
    trace: [],
    materialization: emptyMaterializationMeta(),
    createdAt: now,
    updatedAt: now,
  })

  await projects.insert({
    projectPublicId: opts.projectPublicId,
    workspacePublicId: opts.workspacePublicId,
    sourceDraftPublicId: opts.draftPublicId,
    projectName: opts.projectName,
    operationalApproach: opts.approach,
    initialConfigurationSummary: initialConfigurationSummaryAfterMaterialization(opts.approach),
    status: "active",
    materializedAt: now,
    createdAt: now,
    updatedAt: now,
  })

  ctx.log(`Proyecto: ${opts.projectName} (${opts.approach})`)
}
