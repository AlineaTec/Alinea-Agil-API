# Backend admin de plataforma (`/api`)

Módulos bajo **`/v1/platform`** (sesión **Bearer plataforma**, distinta de `/v1/auth` del cliente). No usar membership de workspace para autorizar estas rutas.

## Módulos

| Carpeta | Rol |
|---------|-----|
| `platform-users/` | Usuarios `platform_*`, MFA TOTP, auth `/v1/platform/auth`, mutaciones de identidad (solo super admin donde aplica). |
| `platform-tenants/` | Tenants 1:1 con `workspacePublicId`, lista/detalle, suspender/reactivar (super admin), resumen de licencia embebido. |
| `platform-billing/` | Lectura comercial agregada (MRR/ARR, ranking por tenant) con la misma lógica que `commercial-pricing` / `billingEstimate`. |
| `platform-registration-payments/` | Lectura de intentos de registro con Paddle (`paymentProviderRef` / `metadata.paddlePaymentAudit`); no PAN ni secretos sensibles. |
| `platform-registration-intents/` | Lista de intents (`IdentityRegistrationIntent`), borrado por IDs y purga bulk sin workspace (mutaciones sólo `platform_super_admin`). |
| `platform-licensing/` | Lectura operativa de licencias por tenant (`workspace-licenses`). |
| `platform-audit/` | Lectura y export del store único `platform_audit_events` (mutaciones ya emitidas por users/tenants). |
| `platform-observability/` | KPIs y salud agregada (`healthStatus`); complementa audit (no la sustituye). |

## Convención de rutas (`/v1/platform`)

| Prefijo | Uso |
|---------|-----|
| `/auth/*` | Público: login plataforma (**`turnstileToken`** si Turnstile está activo; en productivo siempre), MFA onboarding inicial, etc. |
| `/me` (GET/PATCH), `/users/*` | Perfil propio y gestión de identidades (PATCH `/me`: solo `displayName`). |
| `/tenants/*` | `by-workspace` **antes** de `/:platformTenantId`. |
| `/billing/tenants` | Lista + resumen MRR/ARR; detalle en `/:platformTenantId`. |
| `/registration/paddle-payments` | Listado paginado de intents con línea Paddle o auditoría guardada tras `paddle-complete`. |
| `/registration/intents` | Lista paginada con filtros; `POST …/delete` borra IDs; `POST …/purge-non-provisioned` purga intents sin workspace provisionado. |
| `/licensing/tenants/*` | Igual: `by-workspace` antes de `/:platformTenantId`. |
| `/audit/export` | **Antes** de `/audit/events/:id`. |
| `/audit/events` | Listado. |
| `/observability/summary` | Resumen global. |
| `/observability/tenants` | Lista; detalle en `/:platformTenantId`. |

## Contratos transversales

- IDs: `platformTenantId`, `workspacePublicId`, `platformUserId`, `platformAuditEventId`.
- Salud: **`healthStatus`** (`normal` \| `warning` \| `no_data`) en tenants y observabilidad.
- Lectura admin común: `platform_super_admin`, `platform_operator`, `platform_auditor` (ver `platform-admin-readers.ts`); mutaciones puntuales solo super admin según cada módulo.
- Deep links: `admin-paths.ts` (licensing con `PLATFORM_ADMIN_LICENSING_BASE_PATH`, listado de auditoría).

## Orden de montaje (router autenticado)

1. `platform-users` (rutas sueltas `/me`, `/users`)
2. `platform-tenants`
3. `platform-billing`
4. `platform-registration-payments`
5. `platform-registration-intents`
6. `platform-licensing`
7. `platform-audit`
8. `platform-observability`

## Frontend `/admin` (futuro)

Consumir solo `/v1/platform/*` con token de sesión plataforma; no reutilizar JWT de workspace cliente para estas APIs.
