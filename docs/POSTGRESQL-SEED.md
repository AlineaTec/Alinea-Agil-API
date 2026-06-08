# Seed PostgreSQL (`api/`)

Scripts en `src/scripts/seed/` para poblar la base en **local/dev** con el dataset **ACME S.A.**

## Requisitos

- `DATABASE_URL` apuntando a la BD de desarrollo
- **`ALLOW_DB_SEED=1`** obligatorio (evita ejecución accidental; incluido en scripts `seed*` y `db:reset:demo`)
- Migraciones aplicadas (`npm run postgres:migrate:deploy`)

## Contraseñas

Valores por defecto en `src/scripts/seed/shared/credentials.ts` (solo dev). Sobrescribir con env si hace falta.

| Variable | Uso | Default (si no hay env) |
|----------|-----|-------------------------|
| `SEED_PLATFORM_PASSWORD` | Admin plataforma `agil@alineatec.com` | `Ag1l!Platf0rm_At3c_9xK#2026` |
| `SEED_USER_PASSWORD` | Usuarios workspace (todos comparten la misma en demo) | `ACME!Prueb4s_At3c_7vQ#2026` |

## Estrategia de ejecución

El seed está pensado para **base limpia**. La forma recomendada es `npm run db:reset:demo` (vacía la BD y vuelve a sembrar). No está diseñado para upsert completo sobre datos existentes.

## Scripts npm

```bash
# Reset + seed ACME (recomendado)
npm run db:reset:demo

# Solo vaciar BD (sin seed)
npm run db:reset

# Solo seed (asume BD ya vacía / compatible)
npm run seed

# Admin plataforma (independiente, upsert por email)
npm run seed:platform
```

`seed` y `seed:demo` son equivalentes.

## Contenido del seed (ACME S.A.)

Dataset orientado a demos de producto (narrativa retail omnicanal + app fidelización).

| Área | Contenido |
|------|-----------|
| **Workspace** | `acme-demo`, 12 usuarios con nombres/roles, 2 equipos, vínculos equipo↔proyecto, invitación pendiente, tenant plataforma |
| **Kanban** | 15 ítems con descripción, prioridad, asignación, criterios de aceptación; columnas en español; ítem bloqueado; impedimentos |
| **Scrum** | Épica + 14 historias con descripción/estado/asignación; subtareas; 3 sprints (cierre histórico en sprint 1); columnas de tablero en sprint activo |
| **Guided** | Planning, refinement (+ ítems revisados), retro (+ temas, aportes, votos, acción), daily (+ participantes), review (+ demo + feedback) |
| **Colaboración** | Comentarios, time entries, follows, varias notificaciones |
| **Gobernanza** | Billing snapshot, 2 feedbacks, auditoría workspace, ledger email, NBA snooze |

Código: `demo-narrative.ts` (textos), `demo-enrichment.ts` (entidades transversales).

Login workspace: `pruebas@alineatec.com` / `ACME!Prueb4s_At3c_7vQ#2026`  
Login plataforma (admin): `agil@alineatec.com` / `Ag1l!Platf0rm_At3c_9xK#2026`

## Estructura de código

```
src/scripts/seed/
  run.ts              # CLI
  demo.ts
  shared/
    context.ts
    guard.ts
    reset.ts
    truncate-reset.ts
    credentials.ts
    platform.ts
    workspace.ts
    project.ts
    demo-narrative.ts
    demo-enrichment.ts
    kanban.ts
    scrum.ts
    extras.ts
    ids-demo.ts
```

## Reset

| Modo | Comando interno | Cuándo |
|------|-----------------|--------|
| **Por defecto** | `prisma migrate reset --force --skip-seed` | Local/dev (`db:reset`) |
| **Tests** | `TRUNCATE … CASCADE` con `SEED_TRUNCATE_RESET=1` | Integración Postgres (Testcontainers) |

`db:reset:demo` aplica truncate/reset y luego el seed. Es la forma recomendada de dejar la BD reproducible en desarrollo.

## Validación

```bash
npm run build
npm run test:postgres   # incluye seed-scripts
npm run db:reset:demo   # Postgres local
```
