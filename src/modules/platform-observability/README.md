# Módulo `platform-observability` (admin / plataforma)

Slice **admin-observability** v1: **salud mínima y KPIs agregados** por tenant y globalmente. No es APM, tracing, status page ni auditoría.

## Rutas (`/v1/platform`, sesión plataforma)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/observability/summary` | KPIs globales, salud agregada, ranking de tenants en atención. |
| GET | `/observability/tenants` | Lista con salud por tenant (`q`, `limit`, `offset`, `attentionOnly=true`). |
| GET | `/observability/tenants/:platformTenantId` | Detalle resumido de salud de un tenant. |

## KPIs v1 (globales)

- `activeTenantCount`: tenants con `status === active` en `platform_tenants`.
- `warningTenantCount` / `noDataTenantCount` / `normalTenantCount`: conteo por clasificación de salud.
- `activeWarningsCount`: suma de advertencias tipadas en todos los tenants (puede haber varias por tenant).
- `tenantsAttention`: ranking (máx. **200** en v1) de tenants con `warning` o `no_data`, priorizando `warning`.
- `calculatedAt`, `dataSource` explícitos en cada respuesta relevante.

## Clasificación de salud por tenant

| Estado | Criterio v1 |
|--------|-------------|
| `warning` | Tenant suspendido **o** licencia con `seatsAssigned > seatsPurchased`. |
| `no_data` | No existe fila operativa de licencias (sin inventar datos). |
| `normal` | Resto (licencia presente y alineada, tenant no suspendido). |

## `activeWarnings` tipadas

- `TENANT_SUSPENDED` (severidad `warning`, módulo `platform_tenants`).
- `LICENSE_ROW_MISSING` (severidad `info`, `platform_licensing`).
- `LICENSE_SEATS_OVER_ASSIGNED` (severidad `warning`, `platform_licensing` + referencia a tenants).

## `dataSource`

Constante de servicio: derivación en tiempo de request desde catálogo de workspaces, mapeo `platform_tenants`, `workspace_licenses` y conteos operativos (proyectos / miembros activos). Ver `PLATFORM_OBSERVABILITY_DATA_SOURCE` en código.

## Relación con otros módulos

- **`platform-tenants`**: misma fuente de `Workspace` + fila plataforma; aquí no se duplica el detalle funcional del tenant (solo salud + agregados mínimos + rutas relacionadas).
- **`platform-licensing`**: señales de desalineación se reflejan en warnings; enlaces `relatedPaths.licensingAdmin`.
- **`platform-audit`**: referencia contextual en `auditContext` del resumen global; la auditoría no alimenta este cálculo v1.

## Limitaciones / postergados

- Caché/TTL, jobs programados, umbrales por entorno, p95/colas, fuentes externas opcionales, status page pública.

## Tests

```bash
npx tsx --test src/modules/platform-observability/services/platform-observability.service.test.ts
```
