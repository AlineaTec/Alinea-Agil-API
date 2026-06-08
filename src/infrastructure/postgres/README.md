# PostgreSQL / Prisma (infraestructura)

Capa base de persistencia hacia PostgreSQL. **PostgreSQL es el motor de persistencia.

## Uso en código (futuros repositorios)

```ts
import { getPrismaClient, disconnectPrismaClient } from "../../infrastructure/postgres/prisma-client.js"

const prisma = getPrismaClient()
// … operaciones por dominio …
await disconnectPrismaClient() // solo en scripts / tests / shutdown explícito
```

Para tests con URL dinámica (Testcontainers), pasar `databaseUrl` y cerrar ese cliente con `$disconnect()` — no usar el singleton.

## Convenciones (resumen)

| Tema | Regla |
|------|--------|
| Motor objetivo | PostgreSQL |
| ORM principal | Prisma |
| SQL ad hoc | Solo consultas complejas / reportería |
| Tablas / columnas | `snake_case` (`@@map` / `@map`) |
| PK | `id` UUID |
| Exposición API | `public_id` cuando aplique |
| Timestamps | `created_at`, `updated_at` |
| `jsonb` | Solo casos justificados; no sustituir relaciones |

Documentación operativa: [`docs/POSTGRESQL-SETUP.md`](../../docs/POSTGRESQL-SETUP.md).
