# Módulo `platform-audit` (admin / plataforma)

Slice **admin-audit** v1: **consulta y exportación** de eventos de auditoría **de plataforma** almacenados en `platform_audit_events`. No sustituye observabilidad ni la auditoría del runtime cliente.

## Fuente de datos

- Misma colección y modelo que escribe `PlatformAuditService` (`platform-users`): mutaciones de **platform-users**, **platform-tenants**, **billing operations** (reconciliación Paddle), **intents de registro**, etc.
- Campo opcional **`workspacePublicId`** en el documento para filtrar por tenant/workspace; en eventos `tenant.*` se rellena al emitir.

## Rutas (`/v1/platform`, sesión plataforma)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/audit/events` | Listado paginado + filtros. |
| GET | `/audit/events/:platformAuditEventId` | Detalle (misma redacción que lista). |
| GET | `/audit/export?format=csv\|json` | Exportación; mismos filtros que lista (`limit`/`offset` no aplican al volumen exportado; máx. **5000** filas). |

`GET /audit/export` va **antes** de `GET /audit/events/:id` en el router de auditoría (rutas montadas en el mismo router con prefijos completos).

## Filtros (query)

- `platformTenantId` → `targetPlatformTenantId`
- `workspacePublicId` → campo persistido o `payloadAfter.workspacePublicId` (eventos antiguos)
- `actorPlatformUserId`
- `category`: `platform_identity` \| `platform_tenant` \| `platform_operations` \| `platform_licensing`
- `action`: string (acción persistida)
- `from` / `to`: fechas; por defecto ventana **últimos 12 meses** hasta “ahora” si omiten (**retención v1** documentada; purga física postergada)

## Contrato de respuesta (`PlatformAuditEventPublic`)

- Identificadores, `timestamp`, `category` (derivada de `action`), `action`, rol del actor.
- `summary` + `changedFields` (diff superficial de claves en payloads objeto).
- `before` / `after` redactados/truncados según rol y `sensitivityTier` (`standard` \| `elevated` \| `restricted`).
- `targetPlatformUserId`, `targetPlatformTenantId`, `workspacePublicId` con redacción parcial para **auditor**.

## Redacción por rol

| Rol | Resumen | IDs | Payloads elevados (MFA, invitación, password, …) |
|-----|---------|-----|--------------------------------------------------|
| `platform_super_admin` | Completo | Completos | Truncado (mayor límite) |
| `platform_operator` | Sin emails en claro | Completos | Truncado (límite intermedio) |
| `platform_auditor` | Emails enmascarados | Parcial (uuid acortado) | Oculto / mínimo; `changedFields` cuando aplica |

**Export** (CSV / JSON) usa la **misma** proyección redactada que la API.

## Categorías y acciones v1

- **`platform_identity`**: `platform_user.*`
- **`platform_tenant`**: `tenant.suspended`, `tenant.reactivated`
- **`platform_operations`**: `billing.workspace_paddle_reconcile`, `registration.intents_deleted`, `registration.intents_purge_unprovisioned`
- **`platform_licensing`**: futuras mutaciones explícitas de licencias desde plataforma; el filtro por esta categoría usa exclusión de las demás (`$nin`) para incluir cualquier evento aún no clasificado en las tres primeras

## Limitaciones / postergados

- SIEM, observabilidad APM, unificación con auditoría cliente, logging masivo de lecturas.
- Purga TTL / job de retención 12 meses en BD.
- Payloads muy grandes: truncado por política, no almacenamiento en blob.

## Tests

```bash
npx tsx --test src/modules/platform-audit/services/platform-audit-read.service.test.ts
```
