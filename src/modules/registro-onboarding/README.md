# Módulo `registro-onboarding` (API)

Implementación backend alineada a **contracts-docs/docs/modules/registro-onboarding/** (en particular `api-needs.md`).

## Estructura

| Carpeta | Rol |
|---------|-----|
| `domain/` | Tipos y estados de proceso sin ORM en dominio (`IdentityRegistrationIntent`, estados, modalidad). |
| `persistence/` | Contratos de repositorio, esquemas de tipos, mappers, adaptadores `prisma/`. |
| `validation/` | Normalización y esquemas Zod (DTOs); reglas de negocio finas **[P]** se irán cerrando. |
| `integrations/` | Puertos: correo, pago, aprovisionamiento (`PostgresRegistrationProvisioning`), elegibilidad compuesta (`RepositoryAccountLookup`). |
| `services/` | Casos de uso / orquestación por fases (`RegistrationFlowService`). |
| `routes/` | Router Express público `registration.public.routes.ts`. |
| `registration.module.ts` | Ensamblaje de dependencias y montaje bajo `/v1/public/registration`; rate limit compartido en pasos críticos y alias `registration-payment/paddle-complete`. |

**Turnstile:** en **`POST .../email-eligibility`**, **`POST .../account-credentials`** y **`POST .../activate`** el JSON puede incluir `turnstileToken`. Si el API tiene `TURNSTILE_SECRET_KEY` (obligatoria en productivo; ver `api/README.md`), el token es obligatorio en esas rutas y se valida con Cloudflare antes de continuar. Otras rutas públicas de registro siguen protegidas sobre todo por **rate limit** compartido donde aplique.

## Estado actual

- Modelos: **IdentityRegistrationIntent**, **IdentityVerificationChallenge**, **IdentityRegisteredUser**, **Workspace**, **WorkspaceOwnerMembership** (post-activación).
- Estados: `domain/registration-status.ts` (tabla de `api-needs.md`).
- **OP-A1:** `POST /v1/public/registration/email-eligibility` — cuerpo `{ "email": string }`; respuesta no ambigua:
  - `{ "eligible": true, "intentPublicId": string }` o
  - `{ "eligible": false, "reason": "email_already_registered" }`.
- **OP-B1 (emisión):** `POST /v1/public/registration/verification/request` — cuerpo `{ "intentPublicId": string }`; respuesta:
  - `{ "sent": true }` o `{ "sent": true, "devCode": "..." }` **solo** si `REGISTRATION_EXPOSE_OTP_IN_RESPONSE=true`;
  - `{ "sent": false, "reason": "intent_not_found" | "invalid_intent_state" | "intent_expired" | "email_delivery_failed" }` — `email_delivery_failed` indica fallo del proveedor de correo; el desafío creado queda `EXPIRED` y se puede **reintentar** la petición.
  Requiere intento en `EMAIL_COLLECTED` y vigente; persiste `IdentityVerificationChallenge` (código solo como hash); reemisión marca anteriores `PENDING` como `SUPERSEDED`.
- **OP-B3 (confirmar código):** `POST /v1/public/registration/verification/confirm` — `{ "intentPublicId": string, "code": string (6 dígitos) }`.
  - Éxito: `{ "verified": true, "intentPublicId", "intentStatus": "EMAIL_VERIFIED" }` (correo verificado en dominio).
  - Fallo: `{ "verified": false, "reason": "…", "attemptsRemaining?" }` con razones: `intent_not_found`, `invalid_intent_state`, `intent_expired`, `challenge_not_found`, `challenge_expired`, `code_incorrect`, `max_attempts_reached`.
- Política OTP: `domain/verification-challenge.policy.ts` (longitud, TTL, máx. intentos fallidos en **confirmar**).
- Existencia de cuenta: **`RepositoryAccountLookup`** = `REGISTRATION_PROVISIONAL_REGISTERED_EMAILS` + correos ya presentes en **IdentityRegisteredUser** (tras activaciones). Sigue siendo provisional respecto al **módulo de identidad** definitivo.
- **OP-C1 (parcial):** `POST /v1/public/registration/modality` — `{ "intentPublicId", "modality": "individual" | "empresa" }`:
  - Éxito: `{ "ok": true, "intentPublicId", "intentStatus": "MODALITY_SELECTED", "modality" }`.
  - Fallo: `{ "ok": false, "reason": "intent_not_found" | "invalid_intent_state" | "intent_expired" }`.
  Requiere `EMAIL_VERIFIED` o `MODALITY_SELECTED` (no permite cambiar modalidad tras `WORKSPACE_PROPOSED`).
- **OP-D1 (pre-check):** `POST /v1/public/registration/workspace-code-availability` — `{ "code": string, "intentPublicId"?: UUID }`:
  - `{ "available": true, "codeNormalized" }` o `{ "available": false, "reason": "invalid_format" | "reserved" | "taken" }`.
  El `intentPublicId` opcional excluye al propio intento de la comprobación de colisión (mismo slug reenviado). **`taken`** incluye códigos ya usados por un **Workspace** materializado (post-activación).
- **OP-D1 (persistencia):** `POST /v1/public/registration/workspace-identity` — `{ "intentPublicId", "workspaceName", "workspaceCode" }`:
  - Éxito: `{ "ok": true, "intentPublicId", "intentStatus": "WORKSPACE_PROPOSED", "workspaceName", "workspaceCode" }` (código normalizado).
  - Fallo: `ok: false` con `reason` entre `intent_not_found`, `invalid_intent_state`, `intent_expired`, `modality_required`, `invalid_workspace_name`, `invalid_workspace_code`, `code_taken`, `code_reserved`.
  Persiste en el documento: `modality` (ya existente), `workspaceDisplayName` ← `workspaceName`, `workspaceCode` (slug). Índice único disperso en `workspaceCode` (provisionalemente sobre intentos; **no** sustituye unicidad del workspace definitivo en activación).
- Política código/nombre: `domain/workspace-identity.policy.ts`. Slugs reservados: lista por defecto + `REGISTRATION_RESERVED_WORKSPACE_CODES` (coma).
- **OP-E1 (Fase E):** `POST /v1/public/registration/account-credentials` — `{ "intentPublicId", "fullName", "password" }`:
  - Éxito HTTP 200: `{ "ok": true, "intentPublicId", "intentStatus": "CREDENTIALS_SET", "fullName" }` (nombre normalizado; **no** se devuelve contraseña ni hash).
  - Fallo negocio 200: `{ "ok": false, "reason": "intent_not_found" | "invalid_intent_state" | "intent_expired" | "invalid_full_name" | "invalid_password" }`.
  Requiere intento en `WORKSPACE_PROPOSED` o `CREDENTIALS_SET` (reecritura antes de pago), no expirado. Persiste `accountFullName` y `passwordHash` (`v1.scrypt$…`), estado **`CREDENTIALS_SET`**. **No** crea usuario definitivo ni sesión.
  - Validación: nombre 2–200 caracteres (tras normalizar espacios), contraseña 8–128 caracteres — alineado al mock `web`; detalle en `domain/account-credentials.policy.ts`.
  - Hash: `services/intent-password-hash.ts`; pepper `REGISTRATION_INTENT_PASSWORD_PEPPER`. El hash es **provisional para el intento**; en activación el módulo de identidad puede migrar a otro algoritmo — **no** usar este campo para login directo hasta decisión explícita.
  - **MFA (REG-ACCT-04):** no implementado en esta operación; quedará para post-activación o paso dedicado según producto **[P]** (nota en `account-credentials.policy.ts`).
- **OP-Fsim (Fase F, pago simulado):** `POST /v1/public/registration/payment/simulated-confirm` — `{ "intentPublicId", "simulatedOutcome"?: "success" | "declined" | "provider_error" }` (omiso → `success`):
  - Requiere intento **no expirado** en `CREDENTIALS_SET` o `PAYMENT_FAILED` (reintento).
  - Éxito simulado HTTP 200: `{ "ok": true, "intentPublicId", "intentStatus": "PAYMENT_SUCCEEDED" }`. Se guarda `paymentProviderRef` prefijo `sim:ok:…` (trazabilidad mínima, sin id. de pasarela real).
  - Rechazo / fallo técnico simulado HTTP 200: `{ "ok": false, "reason": "payment_declined" | "payment_provider_error", "intentPublicId", "intentStatus": "PAYMENT_FAILED" }` y `paymentProviderRef` `sim:declined:…` o `sim:provider_error:…`.
  - Otros fallos negocio: `{ "ok": false, "reason": "intent_not_found" | "intent_expired" | "invalid_intent_state" }` (sin campos de estado de pago).
  - **No** crea usuario, workspace definitivo ni ejecuta aprovisionamiento. **`ACTIVE`** queda para la fase de activación explícita.
  - Política: `domain/payment-simulation.policy.ts`.
- **OP-Fpaddle (Fase F, pago Paddle Billing):** mismo cuerpo en cualquiera de:
  - `POST /v1/public/registration/payment/paddle-complete`
  - `POST /v1/public/registration/payments/paddle-complete`
  - `POST /v1/public/registration-payment/paddle-complete`
  — `{ "intentPublicId": string (UUID), "paddleTransactionId": string }` (id. de transacción `txn_*` devuelto por Paddle.js al completar checkout).
  - Requiere modo API `PAYMENT_GATEWAY_MODE=sandbox|live` + `PAYMENT_GATEWAY_STATUS=active` (403 si el registro comercial está bloqueado en producción).
  - Verifica la transacción contra la API Paddle (`PADDLE_API_KEY`, entorno alineado al modo) y `custom_data.intent_public_id` si viene en la TX; éxito HTTP 200 con forma análoga a OP-Fsim (`PAYMENT_SUCCEEDED`) o fallo negocio con `payment_declined` / `payment_provider_error` / etc.
  - **404** en este POST en producción suele indicar API desactualizado (sin desplegar el handler) o proxy que no enruta esa ruta — el cliente web reintenta rutas alias; el operador debe redesplegar la API y revisar el balanceador.
- **Activación (post-pago, OP-G1):** `POST /v1/public/registration/activate` — `{ "intentPublicId": string (UUID) }`.
  - Requiere intento **no expirado** en **`PAYMENT_SUCCEEDED`**, con modalidad, identidad de workspace, credenciales y hash ya guardados; revalida formato de código/nombre.
  - Éxito HTTP 200: `{ "ok": true, "intentPublicId", "intentStatus": "ACTIVE", "userPublicId", "workspacePublicId", "workspaceCode", "workspaceDisplayName", "membershipRole": "owner" }`.
  - Fallo negocio HTTP 200: `{ "ok": false, "reason": "intent_not_found" | "intent_expired" | "invalid_intent_state" | "incomplete_registration_data" | "workspace_code_invalid" | "invalid_workspace_identity" | "provision_failed" }`.
  - **Idempotencia:** si el intento ya está `ACTIVE` con IDs de provisioning, la misma llamada devuelve `ok: true` con los mismos datos.
  - Persistencia: transacción Prisma que crea **IdentityRegisteredUser** (hash copiado del intento; **provisional** para login real), **Workspace**, **WorkspaceOwnerMembership** (`owner`), actualiza intento (`provisioned*`, `metadata.activation`) y estado **`ACTIVE`**. **Separado del pago** (no se llama desde `simulated-confirm`).
  - **PostgreSQL:** activación en transacción Prisma (`runInPrismaTransaction`).

## Correo transaccional (v1)

El envío real pasa por **`src/modules/transactional-email`** (Resend, remitente por defecto `agil@mail.alineatec.com`). Este módulo usa el adaptador en `integrations/email/registration-transactional-email.adapter.ts`: OTP de verificación y confirmación tras **pago simulado exitoso**. Variables: ver `api/.env.example` y `transactional-email/README.md`. En local sin clave, `TRANSACTIONAL_EMAIL_DISABLED=true` evita llamadas al proveedor.

## Próximos pasos sugeridos

1. **Post-registro:** primer acceso, sesión y transición a producto (ver `contracts-docs/.../post-registration-access.md`).
2. Catálogo / SKU (OP-C1 completo) y pasarela real; el correo transaccional base ya está centralizado en `transactional-email`.
