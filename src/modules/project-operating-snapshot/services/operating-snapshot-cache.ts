import type { ProjectOperatingSnapshot } from "../domain/operating-snapshot.dto.js"
import { SNAPSHOT_TTL_SECONDS } from "../domain/wizard-stage.js"

type CacheEntry = {
  expiresAtMs: number
  snapshot: ProjectOperatingSnapshot
}

export class OperatingSnapshotCache {
  private readonly store = new Map<string, CacheEntry>()

  cacheKey(workspacePublicId: string, projectPublicId: string, userPublicId: string): string {
    return `${workspacePublicId}:${projectPublicId}:${userPublicId}`
  }

  get(key: string): ProjectOperatingSnapshot | null {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() >= entry.expiresAtMs) {
      this.store.delete(key)
      return null
    }
    return entry.snapshot
  }

  set(key: string, snapshot: ProjectOperatingSnapshot): void {
    this.store.set(key, {
      snapshot,
      expiresAtMs: Date.now() + SNAPSHOT_TTL_SECONDS * 1000,
    })
  }

  invalidateProject(workspacePublicId: string, projectPublicId: string): void {
    const prefix = `${workspacePublicId}:${projectPublicId}:`
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key)
    }
  }

  clear(): void {
    this.store.clear()
  }
}
