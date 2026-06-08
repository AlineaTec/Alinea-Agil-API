# Cierre — PostgreSQL como única persistencia (`api/`)

Estado a **junio 2026**: la migración MongoDB → PostgreSQL está **cerrada**. MongoDB y `mongoose` fueron **retirados del proyecto**; no hay rollback ni drivers duales.

---

## Criterio de salida (cumplido)

| Pregunta | Respuesta |
|----------|-----------|
| ¿Persistencia soportada? | **Solo PostgreSQL** vía Prisma (`DATABASE_URL`). |
| ¿`MONGODB_URI`? | **No existe** en runtime ni en configuración de arranque. |
| ¿`mongoose` en dependencias? | **No.** |
| ¿Dual-write o switch por dominio? | **No.** Factories y `runtimePersistence` usan Prisma únicamente. |

---

## Arranque

1. Definir `DATABASE_URL` (PostgreSQL).
2. Aplicar migraciones: `npm run postgres:migrate:deploy`
3. Arrancar: `npm run dev` o `npm run start`

`server.ts` valida `DATABASE_URL` y comprueba conectividad con Prisma. No hay conexión ni registro de modelos Mongoose.

### Seed plataforma (opcional)

```bash
# PLATFORM_BOOTSTRAP_SUPER_ADMIN_EMAIL + PLATFORM_BOOTSTRAP_SUPER_ADMIN_PASSWORD (≥10 caracteres)
npm run seed:platform
```

Usa Prisma (`platform_users`), no Mongo.

---

## Esquemas `*.schema.ts`

Los ficheros bajo `persistence/schemas/` conservan **tipos de documento** (`*DocProps`) usados por mappers y Prisma. Ya no definen modelos Mongoose ni colecciones Mongo.

---

## Tests

```bash
npm run test:postgres          # integración con Testcontainers (Docker)
npm run build
```

Ver [`TESTING.md`](./TESTING.md).

---

## Histórico

La guía de switch por `*_PERSISTENCE_DRIVER` y rollback a Mongo quedó obsoleta. Referencia archivada en el historial de git previo a esta fase.
