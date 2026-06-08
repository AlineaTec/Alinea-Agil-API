# Módulo `platform-licensing` (admin / plataforma)

Slice **admin-licensing** v1: **solo lectura** del estado operativo de licencias por tenant, alineado a la fuente **`workspace-licenses`** (`WorkspaceLicenseState`). No es billing ni contrato comercial completo.

## Rutas (`/v1/platform`, con sesión plataforma)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/licensing/tenants/by-workspace/:workspacePublicId` | Detalle por workspace (deep link). |
| GET | `/licensing/tenants/:platformTenantId` | Detalle por id plataforma. |

La ruta `by-workspace` está registrada **antes** de `/:platformTenantId` para evitar colisiones.

## Respuesta (`PlatformLicenseViewPublic`)

- `platformTenantId` + `workspacePublicId` (correlación explícita).
- `licenseSummary` o `null` si no hay fila en la colección operativa de licencias.
  - `contractedSeats` ← `seatsPurchased`
  - `assignedSeats` ← `seatsAssigned`
  - `availableSeats` ← derivado (`toSummary` / `computeSeatsAvailable`, puede ser negativo si hay desalineación).
  - `operationalStatus`: `aligned` | `over_assigned`
  - `pendingSeatReduction`, `nextRenewalDate`, `lastRenewalAt`
- `commercialPosture`: siempre **`null`** en v1 (sin campo confiable en la fuente actual).
- `calculatedAt`: instante de armado de la vista.
- `misalignment`: `overAssigned`, `seatsOverContractBy`.
- `warnings`: p. ej. `NO_LICENSE_ROW`, `OVER_ASSIGNED`.
- `dataSource`: `workspace_licenses_v1`.

## Integración con `platform-tenants`

- El resumen embebido en listado/detalle de tenants usa **`workspaceLicenseToTenantEmbed`** (`domain/build-platform-license-view.ts`), misma fuente y mismos números que este módulo.
- `licensingDeepLink` en tenants apunta a `GET .../licensing/tenants/{platformTenantId}`.

## Permisos

- Lectura: `platform_super_admin`, `platform_operator`, `platform_auditor`.
- Sin mutaciones en v1.

## Limitaciones / postergados

- Billing, facturación, cambio de plan, reconciliación manual, histórico profundo.
- Postura comercial / trial cuando exista fuente persistida confiable.

## Tests

```bash
npx tsx --test src/modules/platform-licensing/services/platform-licensing.service.test.ts
```
