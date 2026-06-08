# Runtime de persistencia — PostgreSQL only

El API usa **una sola** fuente de datos: PostgreSQL con Prisma.

## Configuración

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `DATABASE_URL` | **Sí** | Cadena de conexión PostgreSQL para Prisma |

No hay variables `*_PERSISTENCE_DRIVER` ni `MONGODB_URI`.

## Arranque

- `assertDatabaseConfigured()` en `persistence-driver.ts` exige `DATABASE_URL`.
- `getPrismaClient()` y `createRuntimePersistence()` construyen todos los repositorios vía factories `create*Repositories(prisma?)`.
- Transacciones: `runInPrismaTransaction` / `runPreferredTransaction` (Prisma).

## Migraciones

```bash
npm run postgres:migrate:deploy   # producción / CI
npm run postgres:migrate:dev      # desarrollo local
npm run prisma:generate
```

## Más contexto

- Cierre de migración: [`POSTGRESQL-MIGRATION-CLOSURE.md`](./POSTGRESQL-MIGRATION-CLOSURE.md)
- Tests: [`TESTING.md`](./TESTING.md)
