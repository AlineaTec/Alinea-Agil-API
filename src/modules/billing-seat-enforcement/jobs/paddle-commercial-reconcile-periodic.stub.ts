/**
 * Runner opcional para cron / proceso batch: reconciliación Paddle ligera por workspace.
 * No registrar como endpoint HTTP público; invocar desde job interno o script operativo.
 */

import type { PaddleCommercialReconcileService } from "../services/paddle-commercial-reconcile.service.js"

export async function runLightPeriodicPaddleCommercialReconcile(options: {
  reconcileService: PaddleCommercialReconcileService
  limit?: number
  now?: Date
}): Promise<Awaited<ReturnType<PaddleCommercialReconcileService["runLightPeriodic"]>>> {
  return options.reconcileService.runLightPeriodic(options.now ?? new Date(), options.limit ?? 25)
}
