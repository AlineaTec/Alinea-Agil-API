import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import type { WorkspaceCatalogRepository } from "../../platform-tenants/persistence/workspace-catalog.repository.js"
import type { WorkspaceLicenseRepository } from "../../workspace-licenses/persistence/workspace-license.repository.js"
import { buildPlatformLicenseView } from "../domain/build-platform-license-view.js"
import type { PlatformLicenseViewPublic } from "../domain/platform-license-view.js"
import { PlatformLicensingNotFoundError } from "../domain/platform-licensing.errors.js"
import type { PlatformTenantRepository } from "../../platform-tenants/persistence/platform-tenant.repository.js"
import { assertPlatformSessionCanReadLicensing } from "../policies/platform-licensing.policy.js"

export class PlatformLicensingService {
  constructor(
    private readonly tenants: PlatformTenantRepository,
    private readonly licenses: WorkspaceLicenseRepository,
    private readonly workspaceCatalog: WorkspaceCatalogRepository,
  ) {}

  async getByPlatformTenantId(
    session: PlatformSessionContext,
    platformTenantId: string,
  ): Promise<PlatformLicenseViewPublic> {
    assertPlatformSessionCanReadLicensing(session)
    const t = await this.tenants.findByPlatformTenantId(platformTenantId)
    if (!t) {
      throw new PlatformLicensingNotFoundError("NOT_FOUND", "Tenant de plataforma no encontrado.")
    }
    const license = await this.licenses.findByWorkspacePublicId(t.workspacePublicId)
    const ws = await this.workspaceCatalog.findByPublicId(t.workspacePublicId)
    const workspacePlanKind = ws?.modality ?? null
    return buildPlatformLicenseView(
      platformTenantId,
      t.workspacePublicId,
      license,
      new Date(),
      workspacePlanKind,
    )
  }

  async getByWorkspacePublicId(
    session: PlatformSessionContext,
    workspacePublicId: string,
  ): Promise<PlatformLicenseViewPublic> {
    assertPlatformSessionCanReadLicensing(session)
    const byWs = await this.tenants.ensureForWorkspacePublicIds([workspacePublicId])
    const t = byWs.get(workspacePublicId)
    if (!t) {
      throw new PlatformLicensingNotFoundError("NOT_FOUND", "Tenant de plataforma no encontrado.")
    }
    const license = await this.licenses.findByWorkspacePublicId(workspacePublicId)
    const ws = await this.workspaceCatalog.findByPublicId(workspacePublicId)
    const workspacePlanKind = ws?.modality ?? null
    return buildPlatformLicenseView(
      t.platformTenantId,
      workspacePublicId,
      license,
      new Date(),
      workspacePlanKind,
    )
  }
}
