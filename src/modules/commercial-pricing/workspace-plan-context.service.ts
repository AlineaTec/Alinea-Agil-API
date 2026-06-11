import type { PrismaClient } from "@prisma/client"
import type { CommercialPlanTier } from "./commercial-pricing.constants.js"
import { inferPlanTierFromWorkspaceContext } from "./workspace-plan-limits.policy.js"
import { normalizeWorkspaceModality } from "../registro-onboarding/domain/workspace-modality.js"

export class WorkspacePlanContextService {
  constructor(private readonly prisma: PrismaClient) {}

  async resolvePlanTier(workspacePublicId: string): Promise<CommercialPlanTier> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { public_id: workspacePublicId },
      select: {
        modality: true,
        source_registration_intent_public_id: true,
        license: { select: { seats_purchased: true } },
      },
    })
    if (!workspace) {
      return "estandar"
    }

    const intent = await this.prisma.identityRegistrationIntent.findUnique({
      where: { public_id: workspace.source_registration_intent_public_id },
      select: { plan_sku: true },
    })

    const modality = normalizeWorkspaceModality(workspace.modality) ?? "individual"
    const seatsPurchased = workspace.license?.seats_purchased ?? 1

    return inferPlanTierFromWorkspaceContext({
      planSku: intent?.plan_sku,
      modality,
      seatsPurchased,
    })
  }

  async countActiveProjects(workspacePublicId: string): Promise<number> {
    return this.prisma.project.count({
      where: {
        workspace_public_id: workspacePublicId,
        lifecycle_status: "active",
      },
    })
  }
}
