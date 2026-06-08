# Invitaciones y membresía multi-workspace (WMI v1, API)

Documentación interna alineada a **contracts-docs** `docs/modules/workspace-membership-and-invitations/`. El **registro comercial** (nuevo workspace + owner) sigue en `registro-onboarding`; **invitar a un workspace existente** es un flujo aparte: solo crea/actualiza `WorkspaceInvitation` y envía correo transaccional.

## Conceptos

| Concepto | En BD / código |
|----------|------------------|
| Cuenta global | `IdentityRegisteredUser` (una por `emailNormalized`) |
| Membresía operativa | `WorkspaceMember` (acceso al workspace; rol, estado, asiento) |
| Invitación formal | `WorkspaceInvitation` (token opaco hasheado, TTL 7 días, una pendiente efectiva por `workspacePublicId` + email; nueva invitación *supersede* la anterior pendiente) |
| Workspace activo (preferencia) | `IdentityRegisteredUser.preferredActiveWorkspacePublicId` + `preferredActiveWorkspaceUpdatedAt`; validado en servidor contra membresía **utilizable** |
| Utilizable para operaciones | Membresía `active` + `billing.guards.canUsePrimaryWorkspaceProductFeatures` |
| Restricción billing | Membresía sigue existiendo; el workspace puede aparecer en `workspaces[]` con `billingRestricted: true` y sin ser utilizable |

## HTTP

### Público (sin membresía previa)

| Método | Ruta |
|--------|------|
| `GET` | `/v1/public/workspace-invitations/:token/resolve` |
| `POST` | `/v1/public/workspace-invitations/:token/accept` (Bearer; cuerpo `{ "confirm": true }`) |
| `POST` | `/v1/public/workspace-invitations/:token/register-and-accept` (sin Bearer; alta cuenta + membresía) |

### Dentro del workspace (Bearer + actor miembro)

| Método | Ruta |
|--------|------|
| `POST` | `/v1/workspaces/:workspacePublicId/members` — crea **invitación** (`kind: "workspace_invitation"`), no alta silenciosa |
| `GET` | `/v1/workspaces/:workspacePublicId/workspace-invitations` — pendientes (acción `manage_workspace_invitations`) |
| `POST` | `/v1/workspaces/:workspacePublicId/workspace-invitations/:invitationPublicId/revoke` |
| `POST` | `/v1/workspaces/:workspacePublicId/workspace-invitations/:invitationPublicId/resend` — rota token y TTL; correo vía plantilla |

### Sesión / workspace activo

| Método | Ruta |
|--------|------|
| `GET` | `/v1/auth/me` — incluye `workspace`, `workspaces`, `workspaceAccess` |
| `POST` | `/v1/auth/me/active-workspace` — `{ "workspacePublicId": "<uuid>" }` |

## Correos (`transactional-email`)

Plantillas: `workspace_invitation_sent`, `workspace_invitation_accepted`, `workspace_invitation_revoked` (revocación **solo** si `emailCommsSentAt` estaba definido).

## Postergado (v1)

- Handover avanzado de ownership, reglas finas de owner único, invitaciones masivas, UX de conflicto de sesión en `resolve` (el backend ya distingue correo en `accept`).

## Tests

Ver `workspace-users/services/auth-me-resolution.service.test.ts` (resolución multi-workspace, preferencia, billing).
