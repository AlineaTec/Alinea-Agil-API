import type { WorkspaceRepository } from "../../persistence/workspace.repository.js"
import { requireInjected } from "../../../../infrastructure/persistence/require-injected.js"

export function createWorkspaceSlugMaterializedLookup(
  workspaceRepository: WorkspaceRepository | null,
): (normalizedSlug: string) => Promise<boolean> {
  const repo = requireInjected(workspaceRepository, "workspaceRepository")
  return (slug) => repo.existsBySlug(slug)
}
