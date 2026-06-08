import { getPrismaClient } from "../../../../infrastructure/postgres/prisma-client.js"
import { createRegisterPlatformTenantHook } from "../../../platform-tenants/integrations/register-platform-tenant.js"
import type { IdentityRepositories } from "../../../../infrastructure/persistence/identity-repositories.factory.js"
import type { WorkspaceRepositories } from "../../../../infrastructure/persistence/workspace-repositories.factory.js"
import type { WorkspaceLicenseService } from "../../../workspace-licenses/services/workspace-license.service.js"
import type { WorkspaceUserService } from "../../../workspace-users/workspace-users.module.js"
import type { RegistrationProvisioningPort } from "./provisioning.port.js"
import { PostgresRegistrationProvisioning } from "./postgres-registration-provisioning.js"

export function createRegistrationProvisioning(
  _workspaceLicenseService: WorkspaceLicenseService,
  _workspaceUserService: WorkspaceUserService,
  _identity: IdentityRepositories,
  _workspace: WorkspaceRepositories,
): RegistrationProvisioningPort {
  const prisma = getPrismaClient()
  return new PostgresRegistrationProvisioning(prisma, createRegisterPlatformTenantHook(prisma))
}
