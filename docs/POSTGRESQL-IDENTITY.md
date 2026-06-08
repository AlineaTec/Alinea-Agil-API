# PostgreSQL — dominio identity

Modelo y repositorios Prisma de **identity y acceso** (login, registro, reset). El runtime HTTP usa estos adaptadores vía `runtimePersistence` y los módulos `login-session` / `registro-onboarding`.

## Tablas

| Tabla PostgreSQL | Nombre legacy (migración) | Notas |
|------------------|---------------------------|--------|
| `identity_users` | `identity_registered_users` | Usuarios registrados |
| `identity_auth_sessions` | `identity_auth_sessions` | FK a `identity_users` |
| `identity_password_reset_tokens` | `identity_password_reset_tokens` | FK a `identity_users`; `token_hash` único |
| `identity_registration_intents` | `identity_registration_intents` | `metadata` en `jsonb` |
| `identity_verification_challenges` | `identity_verification_challenges` | FK a intents |

Migración: `prisma/migrations/20250605120000_identity_domain/`

## Repositorios Prisma

| Repositorio | Ubicación | Puerto |
|-------------|-----------|--------|
| `IdentityUserForAuthPrismaRepository` | `login-session/persistence/prisma/` | `IdentityRegisteredUserForAuthRepository` |
| `AuthSessionPrismaRepository` | `login-session/persistence/prisma/` | `AuthSessionRepository` |
| `PasswordResetTokenPrismaRepository` | `login-session/persistence/prisma/` | `PasswordResetTokenRepository` |
| `IdentityRegistrationIntentPrismaRepository` | `registro-onboarding/persistence/prisma/` | `IdentityRegistrationIntentRepository` |
| `IdentityVerificationChallengePrismaRepository` | `registro-onboarding/persistence/prisma/` | `IdentityVerificationChallengeRepository` |

## Tests

```bash
npm run test:postgres:identity
npm run test:postgres
```

Ver también: [`POSTGRESQL-SETUP.md`](./POSTGRESQL-SETUP.md), [`POSTGRESQL-MIGRATION-CLOSURE.md`](./POSTGRESQL-MIGRATION-CLOSURE.md).
