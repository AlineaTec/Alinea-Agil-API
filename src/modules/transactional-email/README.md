# Módulo `transactional-email`

Capa centralizada de **correo transaccional** en la API. Los flujos de negocio no construyen HTML ni asuntos: llaman métodos del servicio que renderizan plantillas y envían a través de un **transporte** encapsulado (v1: **Resend**).

## Propósito

- Un solo lugar para enviar correos transaccionales.
- Plantillas versionadas por clave estable (`TransactionalTemplateKey`).
- Proveedor externo **no** acoplado a dominios concretos (auth, platform-users, registro, etc.).
- Trazabilidad mínima: ledger append-only (`transactional_email_outbound_messages` en PostgreSQL) + logs (`transactional_email_sent` / `transactional_email_failed`).

## Remitente único (v1)

Por defecto el remitente es **`agil@mail.alineatec.com`**. No hay soporte multi-remitente en esta versión; ampliar implicaría variables por remitente verificado y política de cuál usar por plantilla (documentado abajo como postergado).

## Variables de entorno

| Variable | Obligatoriedad | Descripción |
|----------|----------------|-------------|
| `RESEND_API_KEY` | **Sí**, si el envío real está activo | Sin clave y sin deshabilitar el módulo, el transporte es **unconfigured** y cada `send` lanza `TransactionalEmailMisconfiguredError` tras registrar el fallo en ledger y log. |
| `TRANSACTIONAL_EMAIL_FROM` | Opcional | `From` (dominio verificado en Resend). Por defecto: `agil@mail.alineatec.com`. |
| `TRANSACTIONAL_EMAIL_DISABLED` | Opcional | `true` / `1` → transporte **noop** (no llama a Resend). En local/CI el ledger registra éxito y se emite log `transactional_email_sent` como en producción. |
| `PLATFORM_ADMIN_PUBLIC_BASE_URL` | Opcional | URL **absoluta** `http(s)://…` del panel admin. Se normaliza en `getPlatformAdminPublicBaseUrl()` (sin query/hash, sin `/` final excepto raíz). Si el valor no es una URL http(s) válida, se trata como ausente. Afecta `platform_user_invited` y `platform_admin_password_reset` (enlaces al admin). |
| `TRANSACTIONAL_EMAIL_LOGO_URL` | Opcional | URL **absoluta** del logo claro sobre fondo oscuro (mismo criterio que `logo-white.png` en informes PDF de la web). Si falta o es inválida, la cabecera HTML usa **wordmark** “Alinea” + “Ágil” (acento dorado `#c9a227`), alineado a `ReportHeader` sin `logoSrc`. |
| `
Convención: lectura en `config/transactional-email-env.ts` (con `dotenv` al arrancar el API).

### Persistencia del ledger (Fase 16)

- **Modelo:** append-only tras cada dispatch (éxito o fallo). No es cola de reintentos.
- **PostgreSQL:** tabla `transactional_email_outbound_messages` (`public_id`, `template_key`, `to_normalized`, `ok`, `provider_message_id`, `error_message`, `created_at`).
- **Runtime:** `app.ts` → `createTransactionalEmailService(runtimePersistence.transactionalEmail.ledger)`.
- **Tests integración:** `npm run test:postgres:transactional-email-switch` (desde `api/`).
### Cabecera y marca (HTML)

Las plantillas comparten `templates/layout.ts`: franja superior **#0a0a0a**, texto **#fafafa**, acento **#c9a227**, fondo de página **#f4f3f0** y borde **#e0ddd6** — mismos tokens que `web/src/modules/reporting/reporting.css` (`--report-header-bg`, etc.). Pie HTML/texto: producto de **AlineaTec** y URL pública **https://agil.alineatec.com** (`BRAND_PRODUCT_PUBLIC_URL`; el pie de informes PDF sigue en `defaultReportBranding` del front si difiere).

## Contrato interno

- **Clave de plantilla** (`TransactionalTemplateKey`): metadato estable para ledger y logs.
- **Destinatario**: normalizado a minúsculas; validación en `validation/email-recipient.ts`.
- **Contenido**: `RenderedTransactionalEmail` (`subject`, `html`, `text`) producido solo por funciones en `templates/`.
- **Envío**: `EmailTransport.send(OutboundEmailPayload)` — Resend, noop, unconfigured.

Los servicios de negocio **no** deben pasar HTML o asunto arbitrarios al transporte; solo métodos de `TransactionalEmailService`.

## Plantillas (v1)

| Clave | Contenido breve |
|-------|-----------------|
| `platform_user_invited` | Invitación admin plataforma: rol, nonce, enlace admin si hay `PLATFORM_ADMIN_PUBLIC_BASE_URL`. |
| `platform_admin_password_reset` | Enlace para restablecer contraseña de administración (`/forgot-password?token=…`). |
| `platform_user_security_notice` | Informativo: activación, desactivación o cambio de rol (sin secretos ni enlaces de acción). |
| `registration_verification_otp` | OTP verificación de correo en registro público. |
| `registration_payment_confirmation` | Tras pago simulado exitoso del intento. |
| `platform_mfa_lockout_notice` | Bloqueo temporal por intentos fallidos de TOTP en **enrolamiento** MFA. |
| `platform_admin_session_started` | Tras **login plataforma exitoso** (nueva sesión): nombre, correo, rol, hora UTC, IP, user-agent, resumen heurístico del cliente, `sessionPublicId` como referencia. |

Asuntos: patrón **«Descripción — Alinea Ágil»** (o equivalente claro). Branding: `templates/layout.ts` (**Alinea Ágil** / **AlineaTec**).

## Cobertura real (flujos conectados)

| Flujo | Plantilla(s) | Notas |
|-------|----------------|-------|
| Invitar usuario plataforma | `platform_user_invited` | Error de envío: **no** revoca la invitación; ledger + log con `ok: false`. |
| Cambio rol / activar / desactivar plataforma | `platform_user_security_notice` | Solo informativo; mismo criterio de no bloquear la mutación si el correo falla. |
| Lockout MFA en `completeMfaEnrollment` | `platform_mfa_lockout_notice` | Se envía al activar el bloqueo. **Login** con cuenta ya bloqueada (`reason: locked`) **no** reenvía correo (evita spam en cada intento). |
| Solicitar OTP registro | `registration_verification_otp` | Si el envío falla: desafío nuevo → **EXPIRED**, respuesta `email_delivery_failed`; cliente puede llamar de nuevo a `/verification/request`. |
| Pago simulado OK registro | `registration_payment_confirmation` | Error de envío: **no** revierte el estado de pago; ledger + log. |
| Login plataforma `POST /v1/platform/auth/login` | `platform_admin_session_started` | Solo si el login termina en **nueva sesión** persistida. IP y `User-Agent` desde la petición (`platform-users/http/request-client-context.ts`). **Un correo por login exitoso** (no en `resolve`, `/me`, ni `logout`). Fallo de envío: **no** revoca el token; ledger + log. |
| Recuperación contraseña plataforma | `platform_admin_password_reset` | `POST /v1/platform/auth/password-reset/request` → enlace con `PLATFORM_ADMIN_PUBLIC_BASE_URL`. Fallo de envío: token emitido se revierte; HTTP sigue respondiendo genérico en request. |

## Pendiente / fuera de alcance (documentado)

- **Recovery / reset de contraseña cliente** (`/v1/auth`): implementado en `login-session` con plantilla `registered_user_password_reset`.
- **Login cliente** (`LoginFlowService`): solo email+password; sin correo transaccional.
- **Perfil cliente** (`ProfileUpdateService`): cambio de nombre/contraseña sin correo (evitar ruido hasta criterio de producto).
- **Tenants / licensing / alertas operativas**: sin hooks de correo en v1.
- **MFA self-service / recuperación** plataforma: explícitamente fuera en `platform-users/README.md`.

## URLs públicas en correos

- **Único origen configurado hoy:** `PLATFORM_ADMIN_PUBLIC_BASE_URL` → `getPlatformAdminPublicBaseUrl()` → plantillas `platform-user-invited.template.ts` y `platform-admin-password-reset.template.ts`.
- Registro/onboarding: copy de “activar desde la aplicación” **sin** URL configurable en v1 (evita hardcodear `localhost`).

## Errores, ledger y política por flujo

1. **`TransactionalEmailService.dispatch`**: tras cada intento, **siempre** append al ledger (`ok` + `providerMessageId` o `errorMessage`). Luego JSON en consola (`level` info/error, `correlationId`, template, destinatario redactado). En error **re-lanza** la excepción.
2. **Notificaciones / invitaciones / confirmación pago / nueva sesión admin**: el módulo consumidor hace **try/catch** → la operación de negocio ya confirmada **no** se revierte; el fallo queda en ledger y logs.
3. **OTP registro**: **excepción** tratada en `RegistrationFlowService.requestVerificationCode`: no se deja un challenge `PENDING` sin correo; se devuelve `email_delivery_failed` y se puede reintentar.

## Cómo probar en dev / staging

1. **Con Resend:** `RESEND_API_KEY`, `TRANSACTIONAL_EMAIL_FROM` alineado al dominio verificado, **no** `TRANSACTIONAL_EMAIL_DISABLED`.
2. **Sin proveedor:** `TRANSACTIONAL_EMAIL_DISABLED=true` → noop; útil para flujo E2E local sin correo real.
3. **Sin clave y sin noop:** primer envío real lanzará `TransactionalEmailMisconfiguredError` (útil para detectar despliegue mal configurado).

## Postergado (no v1)

- Múltiples remitentes e i18n.
- Colas distribuidas y reintentos centralizados.
- Analytics / tracking comercial.
- Editor visual de plantillas.

### Cómo evolucionar a varios remitentes

1. Ampliar configuración (p. ej. mapa validado por entorno).
2. Resolver `from` por plantilla en `dispatch` (no desde payloads HTTP arbitrarios).
3. Opcional: persistir `from` en el ledger.

## Tests

- `templates/templates.test.ts`, `config/transactional-email-env.test.ts`, `services/transactional-email.service.test.ts`.
- Registro: `registro-onboarding/services/registration-flow.verification-email.test.ts`.
- Plataforma: `platform-users.service.test.ts`, `platform-auth.service.test.ts` (login y correo de sesión).

Desde `api`: `npm test`.
