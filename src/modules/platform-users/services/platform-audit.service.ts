import type { PlatformAuditAction } from "../domain/platform-audit-action.js"
import type { PlatformRole } from "../domain/platform-role.js"
import type { PlatformAuditRepository } from "../persistence/platform-audit.repository.js"

export class PlatformAuditService {
  constructor(private readonly repo: PlatformAuditRepository) {}

   async recordUserEvent(
    actor: { platformUserId: string; role: PlatformRole },
    action: PlatformAuditAction,
    targetPlatformUserId: string,
    summary: string,
    payloadBefore: unknown = null,
    payloadAfter: unknown = null,
  ): Promise<void> {
    await this.repo.append({
      actorPlatformUserId: actor.platformUserId,
      actorRole: actor.role,
      action,
      targetPlatformUserId,
      targetPlatformTenantId: null,
      workspacePublicId: null,
      summary,
      payloadBefore,
      payloadAfter,
    })
  }

  async recordTenantEvent(
    actor: { platformUserId: string; role: PlatformRole },
    action: "tenant.suspended" | "tenant.reactivated",
    targetPlatformTenantId: string,
    summary: string,
    payloadBefore: unknown = null,
    payloadAfter: unknown = null,
    workspacePublicId: string | null = null,
  ): Promise<void> {
    await this.repo.append({
      actorPlatformUserId: actor.platformUserId,
      actorRole: actor.role,
      action,
      targetPlatformUserId: null,
      targetPlatformTenantId,
      workspacePublicId,
      summary,
      payloadBefore,
      payloadAfter,
    })
  }

  /**
   * Operaciones sensibles de plataforma sin usuario/tenant destinatario directo
   * (reconciliación billing por workspace, purge de intents de registro, etc.).
   */
  async recordWorkspaceOperationEvent(
    actor: { platformUserId: string; role: PlatformRole },
    action:
      | "billing.workspace_paddle_reconcile"
      | "registration.intents_deleted"
      | "registration.intents_purge_unprovisioned",
    workspacePublicId: string | null,
    summary: string,
    payloadBefore: unknown = null,
    payloadAfter: unknown = null,
  ): Promise<void> {
    await this.repo.append({
      actorPlatformUserId: actor.platformUserId,
      actorRole: actor.role,
      action,
      targetPlatformUserId: null,
      targetPlatformTenantId: null,
      workspacePublicId,
      summary,
      payloadBefore,
      payloadAfter,
    })
  }
}
