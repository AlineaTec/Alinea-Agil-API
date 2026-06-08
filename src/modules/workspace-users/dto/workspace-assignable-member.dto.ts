/** Respuesta mínima para selector de asignación (coordinadores). */
export type WorkspaceAssignableMemberDto = {
  userPublicId: string
  fullName: string
  emailNormalized: string
}

export type WorkspaceAssignableMembersListDto = {
  members: WorkspaceAssignableMemberDto[]
}
