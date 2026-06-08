# Módulo `platform-users` (admin / plataforma)

Backend del slice **admin-platform-users**: gestión de **usuarios de plataforma** con roles `platform_*`, MFA TOTP obligatorio, sesión **separada** del runtime cliente (`/v1/auth` y memberships de workspace).

## Qué implementa (v1)

- Entidad persistida **`PlatformUser`**: email, `displayName`, un solo rol, estado de cuenta, MFA (TOTP), flags de invitación y contraseña.
- Casos de uso: listar, invitar, establecer contraseña inicial (onboarding), activar/desactivar, cambiar rol, enrolamiento MFA, política de **último `platform_super_admin` activo**.
- API bajo prefijos dedicados (ver `platform-users.module.ts`): autenticación plataforma pública vs rutas autenticadas con Bearer de sesión plataforma.
- **Auditoría mínima** en colección propia (`platform_audit_events`): eventos de invitación, actualización de nombre visible (perfil propio), activación, desactivación, cambio de rol, MFA (inicio, enrolado, lockout), contraseña inicial.
- **Correo transaccional** (vía `TransactionalEmailService`): invitación (`platform_user_invited`), **notificación de nueva sesión** tras login plataforma exitoso (`platform_admin_session_started`, IP + user-agent desde la petición), aviso de bloqueo MFA en enrolamiento (`platform_mfa_lockout_notice`), avisos informativos tras activar / desactivar / cambio de rol (`platform_user_security_notice`). Fallo de envío **no** revierte login ni otras operaciones; queda ledger/log; ver `transactional-email/README.md`.
- **Sesión plataforma** (`PlatformSessionContext`): no se derivan permisos de plataforma desde roles del cliente; el middleware de plataforma resuelve el usuario por token de sesión en PostgreSQL.

## Roles v1

| Rol | Listar | Mutaciones identidad / rol / activación |
|-----|--------|------------------------------------------|
| `platform_super_admin` | Sí | Sí (crear, desactivar, activar, cambiar rol, MFA ajeno bajo reglas del servicio) |
| `platform_operator` | Sí | No (no administra identidades de plataforma) |
| `platform_auditor` | Sí (email **redactado** en listados de *otros* usuarios) | No |

Un solo rol por usuario. En **`GET /v1/platform/me`** el actor siempre ve su email completo (necesario para “mi perfil”).

## Estados de usuario

- `pending_activation`: tras invitación; requiere contraseña inicial + MFA TOTP antes de uso real.
- `active`: en flujo de invitación, tras MFA enrolado y **`activate`** por super admin; el seed/bootstrap puede dejar `active` sin MFA aún para el primer operador.
- **Bootstrap / seed**: el primer usuario creado vía `PLATFORM_BOOTSTRAP_*` o `npm run seed:platform` queda en `active` con MFA aún no enrolado, para poder entrar al admin y completar TOTP después.
- `inactive`: desactivado; no debe obtener sesión operativa (el middleware devuelve 403 si aplica).

## MFA v1 (TOTP)

- Obligatorio para todos los `platform_*` en operación real: `mfaStatus` `not_enrolled` | `enrolled`.
- Enrolamiento: secreto en base32, URI `otpauth` para apps estándar (`PLATFORM_MFA_ISSUER`).
- Flujo típico: invitación → `set-initial-password` → `mfa/enrollment/start` (nonce de invitación o super admin) → `complete` con código válido → super admin **`activate`**.
- Intentos fallidos: `PLATFORM_MFA_MAX_FAILED` (default 5), bloqueo `PLATFORM_MFA_LOCKOUT_MINUTES` (default 15); campo `mfaLockedUntil`.
- Recuperación MFA **fuera del producto** en v1 (sin self-service completo).
- **Recuperación de contraseña:** `POST /v1/platform/auth/password-reset/request` y `confirm` (token opaco en `platform_password_reset_tokens`; enlace en correo con `PLATFORM_ADMIN_PUBLIC_BASE_URL/forgot-password?token=…`).

## Variables de entorno relevantes

| Variable | Uso |
|----------|-----|
| `PLATFORM_BOOTSTRAP_SUPER_ADMIN_EMAIL` | Email del super admin sembrado (bootstrap al arranque si la colección está vacía; también `npm run seed:platform`) |
| `PLATFORM_BOOTSTRAP_SUPER_ADMIN_PASSWORD` | Contraseña (mín. 10 caracteres) |
| `PLATFORM_SESSION_TTL_HOURS` | TTL de sesiones Bearer plataforma (ver `PlatformAuthService`) |
| `PLATFORM_MFA_ISSUER` | Emisor TOTP en el QR |
| `PLATFORM_MFA_MAX_FAILED` | Intentos antes de lockout |
| `PLATFORM_MFA_LOCKOUT_MINUTES` | Duración del bloqueo |

Tras **login exitoso**, el correo `platform_admin_session_started` usa la IP del primer valor de `X-Forwarded-For` si existe; en producción detrás de proxy, conviene configurar `trust proxy` en Express para que `req.socket.remoteAddress` y cabeceras encajen con vuestra red.

## Perfil propio (sesión)

- `GET /v1/platform/me` — lectura del usuario autenticado (rol, estado, MFA, timestamps).
- `PATCH /v1/platform/me` — body `{ "displayName": string }` (solo nombre visible; cadena vacía → `null`). No cambia rol, estado, MFA ni email. Auditoría: `platform_user.profile_updated`.

## Separación cliente vs plataforma

- Los usuarios de plataforma **no consumen licencias** del workspace cliente.
- No usar membership ni roles del producto cliente para autorizar estas rutas.
- La documentación de contrato vive en `contracts-docs` (`admin-core`, `admin-platform-users`).

## Limitaciones / postergado

- Impersonación, billing, tenants, licensing, observabilidad avanzada.
- Auditoría cross-módulo unificada (`admin-audit` completo): aquí solo append a repositorio dedicado.
- Multi-rol, recuperación MFA self-service, federación IdP completa (mismo IdP con claims/contexto distinto queda como dirección arquitectónica, no implementación IdP).

## Seed / bootstrap

- Al **arrancar el API**, si `platform_users` está vacío y las variables `PLATFORM_BOOTSTRAP_SUPER_ADMIN_*` están definidas, se crea un super admin (misma lógica que antes, con estado `active`).
- En cualquier momento: `npm run seed:platform` — upsert por email (actualiza contraseña y deja `active` / `not_enrolled` en MFA). Útil si la colección ya tenía datos y el bootstrap del arranque no corrió.

## Tests

```bash
npm test
# o solo este módulo:
npx tsx --test src/modules/platform-users/services/platform-users.service.test.ts
```
