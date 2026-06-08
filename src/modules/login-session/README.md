# Módulo `login-session` (API)

Autenticación con **email + contraseña** y **sesión** mínima, alineado a **contracts-docs** `docs/modules/login-session/`.

## Estructura

| Carpeta / archivo | Rol |
|-------------------|-----|
| `domain/` | Entidades y resultados de casos de uso (`AuthenticatedSession`, `LoginFlowResult`, razones de fallo). |
| `dto/` | Formas tentativas de request/response HTTP (OP-L1). |
| `policies/` | TTL de sesión (`LOGIN_SESSION_TTL_MS`, default 7 días). |
| `validation/` | Esquemas Zod (`login.schemas.ts`, `profile.schemas.ts`); normalización de email igual que registro. |
| `persistence/` | Puertos, modelo de dominio `AuthSession`, repositorios. |
| `services/` | Verificación de credencial (formato `v1.scrypt` del registro), token opaco + hash, `LoginFlowService`, `ProfileUpdateService`. |
| `routes/` | `auth.public.routes.ts` — HTTP bajo `/v1/auth`. |
| `middleware/` | `require-bearer-auth.middleware.ts` — Bearer opaco + sesión vigente → `res.locals.authContext`. |
| `http/` | Helpers HTTP (`parse-bearer-token.ts`). |

## Dependencias

- **`IdentityRegisteredUser`**: lectura por `emailNormalized` vía `IdentityRegisteredUserForAuthPrismaRepository`.
- **`verifyIdentityRegistrationIntentPassword`**: en `registro-onboarding/services/intent-password-hash.ts` (mismo formato que el hash copiado al activar).

## Sesión

- Colección **`AuthSession`**: `sessionPublicId`, `userPublicId`, `tokenHash` (SHA-256 del token opaco), `expiresAt`.
- El cliente recibe el **token opaco** en login; en BD solo está el **hash** (SHA-256). Rutas protegidas envían `Authorization: Bearer <accessToken>`.

## HTTP

| Método | Ruta | Cuerpo / cabeceras |
|--------|------|--------------------|
| `POST` | `/v1/auth/login` | `{ "email": string, "password": string, "turnstileToken"?: string }`; **rate limit** por IP (`http-rate-limit.ts`, `.env.example`). Con `TURNSTILE_SECRET_KEY` definida (obligatoria en productivo; ver `api/README.md`), `turnstileToken` es obligatorio y se valida con Cloudflare. |
| `POST` | `/v1/auth/logout` | Opcional: `Authorization: Bearer <accessToken>`. Elimina la sesión en servidor si el token es válido. |
| `GET` | `/v1/auth/me` | Cabecera `Authorization: Bearer <accessToken>` (mismo valor que devuelve login) |
| `POST` | `/v1/auth/me/active-workspace` | Bearer + JSON `{ "workspacePublicId": string (UUID) }`; persiste preferencia **solo** si el usuario tiene membresía **utilizable** en ese workspace (ver WMI v1). |
| `PATCH` | `/v1/auth/profile` | Bearer + JSON: `fullName?`, `currentPassword?` + `newPassword?` (cambio de clave solo si ambas contraseñas; política de clave alineada a registro) |

Detrás de proxy (p. ej. Vercel), `VERCEL=1` activa `trust proxy` para que el límite use la IP cliente correcta.

**Respuestas `POST /login` (resumen):**

| Situación | HTTP | Cuerpo |
|-----------|------|--------|
| Éxito | 200 | `{ ok: true, accessToken, session: { sessionPublicId, userPublicId, createdAt, expiresAt } }` |
| Credenciales inválidas | 401 | `{ ok: false, reason: "invalid_credentials" }` |
| JSON inválido / Zod | 400 | `{ error: "invalid_request", message, details }` |
| Turnstile activo y falta token o verificación inválida | 400 | `{ error: "invalid_request", code: "turnstile_required" \| "turnstile_invalid", message }` |
| Demasiados intentos (rate limit) | 429 | `{ error: "rate_limit_exceeded", message }` |
| Error no controlado | 500 | comportamiento por defecto de Express (`next(err)`) |

**Respuestas `GET /me`:**

| Situación | HTTP | Cuerpo |
|-----------|------|--------|
| Éxito | 200 | `{ ok: true, user: { … }, session: { … }, access: { kind: "registered_user" }, workspace, workspaces, workspaceAccess }` — ver WMI v1 en `workspace-invitations/README.md`. |
| Sin Bearer / token inválido / sesión inexistente o expirada | 401 | `{ ok: false, error: "unauthorized", reason: "missing_authorization" \| "invalid_bearer" \| "session_not_found_or_expired" }` |

**WMI v1:** `workspace` es el contexto resuelto (puede ser `null` si no hay un único camino o falta selección). `workspaces` lista membresías con `utilizableForOperations` y `billingRestricted`. `workspaceAccess` resume preferencia persistida, selector, ausencia de workspaces y activo invalidado. La lógica vive en `AuthMeResolutionService` (`WorkspaceMember` + `Workspace` + estado de facturación + `IdentityRegisteredUser.preferredActiveWorkspacePublicId`).

**`POST /me/active-workspace`:** 200 con `workspace`, `workspaces`, `workspaceAccess` actualizados; 400 `{ ok: false, error: "active_workspace_invalid", … }` si el workspace no es utilizable para la cuenta.

**Nota:** `WorkspaceOwnerMembership` (registro / owner) no se usa aquí: los invitados no tienen esa fila; la membresía operativa es `WorkspaceMember`.

Ejemplo de `workspace` cuando hay datos:

```json
{
  "workspacePublicId": "…",
  "workspaceCode": "mi-equipo",
  "workspaceDisplayName": "Mi equipo",
  "membership": {
    "membershipPublicId": "…",
    "status": "active",
    "workspaceRoleAdministrative": "admin",
    "workspaceRoleMethodological": null
  }
}
```

**Respuestas `PATCH /profile`:**

| Situación | HTTP | Cuerpo |
|-----------|------|--------|
| Éxito | 200 | `{ ok: true, user: { userPublicId, emailNormalized, fullName, modalityAtSignup } }` (misma forma que `user` en `/me`) |
| JSON / reglas Zod | 400 | `{ error: "invalid_request", message, details? }` |
| Nombre o clave inválidos, clave actual incorrecta, sin cambio efectivo | 400 | `{ ok: false, error: "invalid_request", code, message }` — códigos: `invalid_full_name`, `invalid_new_password`, `invalid_current_password`, `no_effective_change` |
| Usuario no encontrado | 404 | `{ ok: false, error: "not_found", code: "user_not_found", message }` |
| Fallo al persistir | 500 | `{ ok: false, error: "internal_error", message }` |
| Sin Bearer / sesión inválida | 401 | Igual que `/me` |

El usuario objetivo es **siempre** el de la sesión Bearer; no se acepta `userPublicId` en el cuerpo. No se devuelven hashes ni contraseñas.

**Nota:** solo se actualiza el documento **`IdentityRegisteredUser`**. Otros datos desnormalizados (p. ej. nombre en `WorkspaceMember`) no se sincronizan en esta versión.

**Respuestas `POST /logout`:**

| Situación | HTTP | Cuerpo |
|-----------|------|--------|
| Siempre tras procesar |200 | `{ ok: true }` |

Si el Bearer es válido y la sesión existe, se **elimina** el documento `AuthSession` (el mismo token deja de servir para `/me` y rutas protegidas). Si el token falta, es inválido o la sesión ya no existe, no se devuelve error: el cliente puede limpiar almacenamiento local de forma uniforme.

**Convención:** **401** para fallo de autenticación (distinto del estilo “todo 200” del registro público), **salvo** en `POST /logout` donde **200** es intencionalmente idempotente.

Extensiones futuras: cookie httpOnly, refresh — sin cambiar el núcleo del flujo de login.

**Reutilizar auth en otras rutas:** montar el mismo `requireBearerAuth(authBearerService)` (o inyectar `AuthBearerService` y llamar a `resolveFromAuthorizationHeader` en un guard propio).
