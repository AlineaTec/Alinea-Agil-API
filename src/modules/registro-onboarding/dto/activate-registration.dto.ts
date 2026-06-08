export type ActivatePaidRegistrationResponse =
  | {
      ok: true
      intentPublicId: string
      intentStatus: "ACTIVE"
      userPublicId: string
      workspacePublicId: string
      workspaceCode: string
      workspaceDisplayName: string
      membershipRole: "owner"
    }
  | {
      ok: false
      reason:
        | "intent_not_found"
        | "intent_expired"
        | "invalid_intent_state"
        | "incomplete_registration_data"
        | "workspace_code_invalid"
        | "invalid_workspace_identity"
        | "provision_failed"
    }
