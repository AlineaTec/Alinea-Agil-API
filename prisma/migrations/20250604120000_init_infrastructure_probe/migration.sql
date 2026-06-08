-- Fase 0: tabla técnica para validar tubería Prisma + PostgreSQL (no dominio de negocio).

CREATE TABLE "infrastructure_connectivity_probe" (
    "id" UUID NOT NULL,
    "probe_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "infrastructure_connectivity_probe_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "infrastructure_connectivity_probe_probe_key_key" ON "infrastructure_connectivity_probe"("probe_key");
