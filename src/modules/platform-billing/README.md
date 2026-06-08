# Platform billing (lectura comercial)

Superficie **solo lectura** para negocio: MRR/ARR agregados y ranking por tenant. No es facturación, impuestos ni conciliación.

## Fuente de verdad

Misma regla que `billingEstimate` en detalle de tenant: `computeManagedWorkspaceCommercial` → `computeCommercialQuote` (`commercial-pricing/`).

- Workspace: `modality`, `billingCadence` (si falta, se asume mensual — ver `billingCadenceAssumedMonthly` en respuesta).
- Licencia: `seatsPurchased` para Team (mínimo facturable sigue aplicando en la fórmula).

## Rutas (`/v1/platform`, autenticado)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/billing/tenants` | `{ summary, items }`. Query: `q`, `sort` (`equivalent_monthly_desc` \| `equivalent_monthly_asc` \| `name_asc` \| `code_asc`). |
| GET | `/billing/tenants/:platformTenantId` | Fila comercial detallada de un tenant. |

## MRR / ARR

- **MRR (USD):** suma de `quote.equivalentMonthlyUsd` para tenants **activos** con línea comercial **ok** (hay licencia y mapping de plataforma).
- **ARR (USD):** `MRR × 12` (convención SaaS; el equivalente mensual ya refleja descuento anual si `billingCadence` es anual).

Tenants **suspendidos** aparecen en listado con cotización posible pero **no** entran en el MRR.

## Incompletos

- `missing_license`: sin fila en `workspace-licenses` → no se inventa importe.
- `missing_platform_tenant`: sin fila en `platform_tenants` para ese workspace (anomalía).

## Relación con otros módulos

- **Tenants:** mismo catálogo de workspaces; deep link a detalle vía `platformTenantId`.
- **Licensing:** asientos contratados son insumo del precio; asientos asignados no cambian la cotización mostrada aquí.
