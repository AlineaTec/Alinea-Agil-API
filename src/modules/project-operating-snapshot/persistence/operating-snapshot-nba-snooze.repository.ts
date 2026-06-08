export type OperatingSnapshotNbaSnoozeState = {
  snoozePublicId: string
  workspacePublicId: string
  projectPublicId: string
  userPublicId: string
  snoozeKey: string
  snoozedUntilOperationalDate: string
  createdAt: Date
  updatedAt: Date
}

import { randomUUID } from "node:crypto"

export function newSnoozeState(input: {
  workspacePublicId: string
  projectPublicId: string
  userPublicId: string
  snoozeKey: string
  snoozedUntilOperationalDate: string
}): OperatingSnapshotNbaSnoozeState {
  const now = new Date()
  return {
    snoozePublicId: randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  }
}

export type OperatingSnapshotNbaSnoozeRepository = {
  upsert(state: OperatingSnapshotNbaSnoozeState): Promise<void>
  listActiveForUserProject(
    workspacePublicId: string,
    projectPublicId: string,
    userPublicId: string,
    operationalDateYmd: string,
  ): Promise<OperatingSnapshotNbaSnoozeState[]>
  deleteExpiredBefore(operationalDateYmd: string): Promise<number>
}
