import type { PrismaClient } from "@prisma/client"
import { normalizeWorkspaceModality } from "../../../registro-onboarding/domain/workspace-modality.js"
import type {
  WorkspaceIdentityRepository,
  WorkspaceIdentitySnapshot,
} from "../workspace-identity.repository.js"

/** Lectura mínima de workspace para WMI (PostgreSQL). */
export class WorkspaceIdentityPrismaRepository implements WorkspaceIdentityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByWorkspacePublicId(
    workspacePublicId: string,
  ): Promise<WorkspaceIdentitySnapshot | null> {
    const row = await this.prisma.workspace.findUnique({
      where: { public_id: workspacePublicId },
      select: {
        public_id: true,
        slug: true,
        display_name: true,
        modality: true,
        source_registration_intent_public_id: true,
      },
    })
    if (!row) return null
    return {
      workspacePublicId: row.public_id,
      code: row.slug,
      displayName: row.display_name,
      modality: normalizeWorkspaceModality(row.modality) ?? "individual",
      sourceRegistrationIntentPublicId: row.source_registration_intent_public_id,
    }
  }
}
