# Módulo `platform-tenants` (admin / plataforma)

Slice **admin-tenants**: listado y detalle mínimo de tenants con correlación explícita **`platformTenantId` ↔ `workspacePublicId`**, sin gobierno vía endpoints del runtime cliente.

## Qué implementa (v1)

- Colección **`platform_tenants`** (1:1 con workspace en comportamiento v1): `platformTenantId`, `workspacePublicId`, `status` (`active` \| `suspended`), timestamps.
- **Provisioning**: al crear un workspace en `PostgresRegistrationProvisioning` se inserta la fila plataforma en la misma transacción (`registerPlatformTenantForNewWorkspace`).
- **Backfill**: en listados/detalle, `ensureForWorkspacePublicIds` crea filas faltantes para workspaces ya existentes (idempotente).
- **Lectura** (roles `platform_super_admin`, `platform_operator`, `platform_auditor`):
  - `GET /v1/platform/tenants?q=&limit=&offset=`
  - `GET /v1/platform/tenants/:platformTenantId`
  - `GET /v1/platform/tenants/by-workspace/:workspacePublicId` (ruta registrada **antes** del detalle por `:platformTenantId`)
- **Mutación** (solo `platform_super_admin`):
  - `PATCH /v1/platform/tenants/:platformTenantId` con body `{ "status": "active" | "suspended" }` (transiciones `active` ↔ `suspended`).
  - Auditoría plataforma: `tenant.suspended`, `tenant.reactivated` (`PlatformAuditService.recordTenantEvent`).

## Respuesta lista / detalle

- Siempre incluye **ambos** ids (`platformTenantId`, `workspacePublicId`).
- Metadatos workspace sin PII de personas: `displayName`, `code`, `modality`.
- **`healthStatus`**: `normal` \| `warning` \| `no_data` — señal mínima y honesta v1 (alineado con observabilidad):
  - `warning` si el tenant está `suspended` o si licencia tiene `seatsAssigned > seatsPurchased`.
  - `no_data` si no hay fila de licencia (sin inventar salud).
  - `normal` si hay licencia y no aplica lo anterior.
- **`aggregates`**:
  - Lista: `projectsCount`, `activeMembersCount` (miembros `active` \| `active_without_seat`).
  - Detalle: además conteos por enfoque (`scrum` / `kanban` / `other`) y `dominantMethodology`.
- **`licenseSummary`**: construido con **`workspaceLicenseToTenantEmbed`** (`platform-licensing`), misma fuente que `GET /v1/platform/licensing/tenants/:platformTenantId`.
- **`billingEstimate`**: `computeManagedWorkspaceCommercial` → `computeCommercialQuote` (misma regla que `GET /v1/platform/billing/tenants`).
- **`licensingDeepLink`**: por defecto `/v1/platform/licensing/tenants/{platformTenantId}`; prefijo configurable con `PLATFORM_ADMIN_LICENSING_BASE_PATH`.

## Separación runtime cliente

- Autorización solo por **`PlatformSessionContext`** (middleware de `/v1/platform`), no por membership del workspace.
- No se exponen listas de admins ni emails de miembros.

## Auditoría

- Eventos de tenant usan `targetPlatformTenantId` en `platform_audit_events`; los de usuario plataforma siguen usando `targetPlatformUserId`.

## Limitaciones / postergados

- Agregados comerciales (MRR/ARR, ranking): ver **`platform-billing`**; aquí solo el estimate por tenant en detalle.
- Vistas cross-tenant profundas, acciones masivas, observabilidad real compartida con **admin-observability** (el health sigue siendo mínimo).
- `planType` y profundidad **admin-licensing**.
- Estados adicionales (p. ej. `provisioning`) **[P]** en contrato.

## Tests

```bash
npx tsx --test src/modules/platform-tenants/services/platform-tenants.service.test.ts
```
