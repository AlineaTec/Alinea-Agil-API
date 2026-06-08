import type { SeedContext } from "./shared/context.js"
import {
  DEMO,
  demoMembershipPublicId,
  demoUserEmail,
  demoUserPublicId,
  impedimentPublicId,
} from "./shared/ids-demo.js"
import { ACME_DEMO_USER_NAMES, ACME_KANBAN_ITEMS, ACME_SCRUM_STORIES } from "./shared/demo-narrative.js"
import { seedAcmeDemoEnrichment } from "./shared/demo-enrichment.js"
import { seedPlatformAdmin } from "./shared/platform.js"
import { seedWorkspaceBundle, type SeedUserSpec } from "./shared/workspace.js"
import { seedProject } from "./shared/project.js"
import {
  seedKanbanFlow,
  seedKanbanWorkControls,
  seedKanbanWorkItems,
} from "./shared/kanban.js"
import {
  seedScrumBacklog,
  seedScrumGuidedSessions,
  seedScrumImpediment,
  seedScrumSprints,
  seedScrumWorkControls,
} from "./shared/scrum.js"
import {
  seedBillingSnapshot,
  seedProductFeedback,
  seedWorkActivityNotification,
} from "./shared/extras.js"
import { daysAgo, utcDate } from "./shared/dates.js"

function buildDemoUsers(): SeedUserSpec[] {
  const users: SeedUserSpec[] = []
  for (let i = 1; i <= 12; i++) {
    const roles =
      i === 1
        ? { adminRole: "admin" as const, methodRole: "product_owner" as const }
        : i <= 3
          ? { adminRole: "operator" as const, methodRole: "scrum_master" as const }
          : i <= 8
            ? { adminRole: null, methodRole: "scrum_developer" as const }
            : { adminRole: null, methodRole: null }
    const name = ACME_DEMO_USER_NAMES[i] ?? `Colaborador ${i}`
    users.push({
      publicId: i === 1 ? DEMO.ownerUserId : demoUserPublicId(i),
      email: demoUserEmail(i),
      fullName: i === 1 ? `${name} (ACME)` : `${name} — ACME`,
      membershipPublicId: i === 1 ? DEMO.ownerMembershipId : demoMembershipPublicId(i),
      hasSeat: i <= 10,
      ...roles,
    })
  }
  return users
}

export async function runDemoSeed(ctx: SeedContext): Promise<void> {
  ctx.log("=== Seed demo ACME S.A. ===")
  const ws = DEMO.workspaceId
  const owner = DEMO.ownerUserId
  const users = buildDemoUsers()
  const u = demoUserPublicId

  await seedPlatformAdmin(ctx, {
    platformUserId: DEMO.platformUserId,
    email: DEMO.platformEmail,
    displayName: "Admin Alinea Ágil",
  })

  await seedWorkspaceBundle(ctx, {
    intentPublicId: DEMO.intentId,
    workspacePublicId: ws,
    slug: DEMO.workspaceSlug,
    displayName: "ACME S.A.",
    modality: "empresa",
    owner: users[0]!,
    members: users.slice(1),
    seatsPurchased: 20,
    withPlatformTenant: true,
    platformTenantId: DEMO.platformTenantId,
    teams: [
      {
        teamPublicId: DEMO.teamAlphaId,
        name: "Equipo Tienda Digital",
        leadUserPublicId: u(2),
        memberUserPublicIds: users.slice(1, 7).map((x) => x.publicId),
      },
      {
        teamPublicId: DEMO.teamBetaId,
        name: "Equipo Logística y Fulfillment",
        leadUserPublicId: u(8),
        memberUserPublicIds: users.slice(7, 11).map((x) => x.publicId),
      },
    ],
  })

  await seedBillingSnapshot(ctx, ws, 20)

  // --- Proyecto Kanban: Checkout Omnicanal ---
  await seedProject(ctx, {
    workspacePublicId: ws,
    draftPublicId: DEMO.kanbanDraftId,
    projectPublicId: DEMO.kanbanProjectId,
    projectName: "Checkout Omnicanal",
    approach: "kanban",
    createdByUserPublicId: owner,
  })

  await seedKanbanFlow(ctx, {
    workspacePublicId: ws,
    projectPublicId: DEMO.kanbanProjectId,
    entryColumnPublicId: DEMO.kanbanColReady,
    columns: [
      { columnPublicId: DEMO.kanbanColReady, name: "Por hacer", position: 0 },
      { columnPublicId: DEMO.kanbanColProgress, name: "En curso", position: 1 },
      { columnPublicId: DEMO.kanbanColReview, name: "Revisión", position: 2 },
      { columnPublicId: DEMO.kanbanColDone, name: "Hecho", position: 3 },
    ],
  })

  await seedKanbanWorkControls(ctx, {
    workspacePublicId: ws,
    projectPublicId: DEMO.kanbanProjectId,
    startColumnPublicId: DEMO.kanbanColProgress,
    doneColumnPublicId: DEMO.kanbanColDone,
  })

  await seedKanbanWorkItems(ctx, {
    workspacePublicId: ws,
    projectPublicId: DEMO.kanbanProjectId,
    createdByUserPublicId: owner,
    items: ACME_KANBAN_ITEMS.map((item) => ({
      publicId: item.publicId,
      title: item.title,
      description: item.description,
      sortOrder: item.sortOrder,
      columnPublicId: item.columnPublicId,
      storyPoints: item.storyPoints,
      priorityLevel: item.priorityLevel,
      assignedUserPublicId: item.assigneeIndex ? u(item.assigneeIndex) : null,
      isBlocked: item.isBlocked,
      blockedReason: item.blockedReason,
    })),
  })

  await seedScrumImpediment(ctx, {
    workspacePublicId: ws,
    projectPublicId: DEMO.kanbanProjectId,
    impedimentPublicId: impedimentPublicId(1),
    title: "API de pagos con latencia > 800ms en hora punta",
    reporterUserPublicId: u(3),
    workItemPublicId: ACME_KANBAN_ITEMS[1]!.publicId,
  })

  // --- Proyecto Scrum: App Móvil Fidelización ---
  await seedProject(ctx, {
    workspacePublicId: ws,
    draftPublicId: DEMO.scrumDraftId,
    projectPublicId: DEMO.scrumProjectId,
    projectName: "App Móvil Fidelización",
    approach: "scrum",
    createdByUserPublicId: owner,
  })

  await seedScrumWorkControls(ctx, ws, DEMO.scrumProjectId)

  await seedScrumBacklog(ctx, {
    workspacePublicId: ws,
    projectPublicId: DEMO.scrumProjectId,
    authorUserPublicId: owner,
    epic: {
      publicId: DEMO.epicId,
      title: "Programa de puntos y rewards ACME Plus",
    },
    stories: ACME_SCRUM_STORIES.map((s) => ({
      publicId: s.publicId,
      title: s.title,
      description: s.description,
      points: s.points,
      priorityLevel: s.priorityLevel,
      status: s.status,
      assignedUserPublicId: s.assigneeIndex ? u(s.assigneeIndex) : null,
    })),
  })

  const now = ctx.now
  await seedScrumSprints(ctx, {
    workspacePublicId: ws,
    projectPublicId: DEMO.scrumProjectId,
    authorUserPublicId: owner,
    sprints: [
      {
        sprintPublicId: DEMO.sprint1Id,
        name: "Sprint 1 — Fundamentos",
        status: "closed",
        startDate: daysAgo(now, 28),
        endDate: daysAgo(now, 14),
        assignments: ACME_SCRUM_STORIES.slice(0, 5).map((s, idx) => ({
          workItemPublicId: s.publicId,
          sortOrder: idx + 1,
        })),
      },
      {
        sprintPublicId: DEMO.sprint2Id,
        name: "Sprint 2 — Rewards y canje",
        status: "active",
        startDate: daysAgo(now, 13),
        endDate: daysAgo(now, -1),
        assignments: ACME_SCRUM_STORIES.slice(5, 10).map((s, idx) => ({
          workItemPublicId: s.publicId,
          sortOrder: idx + 1,
        })),
      },
      {
        sprintPublicId: DEMO.sprint3Id,
        name: "Sprint 3 — Analytics y growth",
        status: "planning",
        startDate: utcDate(2026, 6, 15),
        endDate: utcDate(2026, 6, 28),
        assignments: ACME_SCRUM_STORIES.slice(10, 14).map((s, idx) => ({
          workItemPublicId: s.publicId,
          sortOrder: idx + 1,
        })),
      },
    ],
  })

  await seedScrumGuidedSessions(ctx, {
    workspacePublicId: ws,
    projectPublicId: DEMO.scrumProjectId,
    sprintPublicId: DEMO.sprint2Id,
    facilitatorUserPublicId: u(2),
    planningSessionPublicId: DEMO.planningSessionId,
    refinementSessionPublicId: DEMO.refinementSessionId,
    retroSessionPublicId: DEMO.retroSessionId,
    sessionDate: "2026-06-01",
  })

  await seedScrumImpediment(ctx, {
    workspacePublicId: ws,
    projectPublicId: DEMO.scrumProjectId,
    impedimentPublicId: impedimentPublicId(2),
    title: "Dependencia API antifraude del equipo core",
    reporterUserPublicId: u(4),
    sprintPublicId: DEMO.sprint2Id,
    workItemPublicId: ACME_SCRUM_STORIES[5]!.publicId,
  })

  await seedProductFeedback(ctx, {
    workspacePublicId: ws,
    userPublicId: u(5),
    submissionPublicId: "e9040001-0000-4000-8000-000000000001",
    title: "Mejorar filtros en backlog Scrum",
  })

  await seedWorkActivityNotification(ctx, {
    notificationPublicId: "e9019999-0000-4000-8000-000000000099",
    workspacePublicId: ws,
    projectPublicId: DEMO.scrumProjectId,
    recipientUserPublicId: u(6),
    workItemPublicId: ACME_SCRUM_STORIES[0]!.publicId,
    actorUserPublicId: u(2),
    dedupeKey: `seed-demo-notif-${DEMO.scrumProjectId}`,
    title: "Nuevo comentario en historia",
  })

  await seedAcmeDemoEnrichment(ctx, { workspacePublicId: ws, ownerUserPublicId: owner })

  ctx.log("=== Seed demo ACME completado ===")
  ctx.log(`Workspace: ${DEMO.workspaceSlug} (${ws})`)
  ctx.log(`Kanban: ${DEMO.kanbanProjectId} | Scrum: ${DEMO.scrumProjectId}`)
  ctx.log(`Login: ${DEMO.ownerEmail} / ${ctx.passwordPlain}`)
}
