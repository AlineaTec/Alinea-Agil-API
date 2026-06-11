import cors from "cors"
import express, { type Express } from "express"
import helmet from "helmet"
import {
  createLoginSessionStack,
  mountLoginSessionModule,
} from "./modules/login-session/login-session.module.js"
import { createRuntimePersistence } from "./composition/runtime-persistence.js"
import { getPrismaClient } from "./infrastructure/postgres/prisma-client.js"
import { mountRegistroOnboardingModule } from "./modules/registro-onboarding/registration.module.js"
import {
  createWorkspaceLicenseService,
  mountWorkspaceLicensesModule,
} from "./modules/workspace-licenses/workspace-licenses.module.js"
import {
  createPaddleBillingWebhookIngestionService,
  createWorkspaceBillingNotificationService,
  createWorkspaceBillingPortalService,
  createWorkspaceBillingStateService,
  createWorkspaceCommercialSubscriptionService,
  createWorkspaceSeatExpansionGate,
  createWorkspaceBillingPrimaryProductMutationGate,
  mountBillingSeatEnforcementModule,
  mountPaddleBillingWebhookIntegration,
} from "./modules/billing-seat-enforcement/billing-seat-enforcement.module.js"
import { WorkspaceInvitationService } from "./modules/workspace-invitations/services/workspace-invitation.service.js"
import { mountWorkspaceInvitationsPublicModule } from "./modules/workspace-invitations/workspace-invitations.module.js"
import {
  createWorkspaceSettingsService,
  mountWorkspaceSettingsModule,
} from "./modules/workspace-settings/workspace-settings.module.js"
import {
  AuthMeResolutionService,
  createWorkspaceUserService,
  mountWorkspaceUsersModule,
} from "./modules/workspace-users/workspace-users.module.js"
import { ScrumCarryoverDerivationService } from "./modules/project-scrum-carryover/services/scrum-carryover-derivation.service.js"
import {
  createProjectAssignableUsersService,
  createScrumBacklogService,
  createWorkItemAssignmentService,
  mountProjectScrumBacklogModule,
} from "./modules/project-scrum-backlog/project-scrum-backlog.module.js"
import { mountProjectWorkAssignmentByProjectRoutesFirst } from "./modules/work-item-assignment/routes/project-work-assignment-by-project.routes.js"
import { createWorkItemCommentsService } from "./modules/work-item-comments/work-item-comments.module.js"
import { createWorkItemTimeEntriesService } from "./modules/work-item-time-logging/work-item-time-logging.module.js"
import {
  createGuidedRefinementService,
  mountGuidedRefinementModule,
} from "./modules/guided-refinement/guided-refinement.module.js"
import {
  createGuidedReviewService,
  mountGuidedReviewModule,
} from "./modules/guided-review/guided-review.module.js"
import {
  createGuidedRetrospectiveService,
  mountGuidedRetrospectiveModule,
  mountGuidedRetrospectivePublicModule,
} from "./modules/guided-retrospective/guided-retrospective.module.js"
import {
  createGuidedSprintPlanningService,
  mountGuidedSprintPlanningModule,
} from "./modules/guided-sprint-planning/guided-sprint-planning.module.js"
import {
  createDailyAlignmentService,
  mountDailyAlignmentModule,
} from "./modules/daily-alignment/daily-alignment.module.js"
import {
  createOperatingSnapshotService,
  mountOperatingSnapshotModule,
} from "./modules/project-operating-snapshot/project-operating-snapshot.module.js"
import {
  createSprintBoardService,
  mountProjectScrumSprintBoardModule,
} from "./modules/project-scrum-sprint-board/project-scrum-sprint-board.module.js"
import {
  createBoardColumnItemMovementService,
  mountBoardColumnItemMovementModule,
} from "./modules/board-column-item-movement/board-column-item-movement.module.js"
import {
  createSprintClosureService,
  mountProjectScrumSprintClosureModule,
} from "./modules/project-scrum-sprint-closure/project-scrum-sprint-closure.module.js"
import {
  createSprintMetricsService,
  mountProjectScrumSprintMetricsModule,
} from "./modules/project-scrum-sprint-metrics/project-scrum-sprint-metrics.module.js"
import {
  createScrumBurndownVelocityService,
  mountProjectScrumBurndownVelocityModule,
} from "./modules/project-scrum-burndown-velocity/project-scrum-burndown-velocity.module.js"
import {
  createSprintReviewService,
  mountProjectScrumSprintReviewModule,
} from "./modules/project-scrum-sprint-review/project-scrum-sprint-review.module.js"
import {
  createSprintRetrospectiveService,
  mountProjectScrumSprintRetrospectiveModule,
} from "./modules/project-scrum-sprint-retrospective/project-scrum-sprint-retrospective.module.js"
import {
  createSprintPlanningService,
  mountProjectScrumSprintPlanningModule,
} from "./modules/project-scrum-sprint-planning/project-scrum-sprint-planning.module.js"
import {
  createProjectImpedimentCommentsService,
  createImpedimentService,
  mountProjectImpedimentsModule,
} from "./modules/project-impediments/project-impediments.module.js"
import {
  createKanbanBoardService,
  mountProjectKanbanBoardModule,
} from "./modules/project-kanban-board/project-kanban-board.module.js"
import {
  createKanbanWipConfigService,
  mountProjectKanbanWipLimitsModule,
} from "./modules/project-kanban-wip-limits/project-kanban-wip-limits.module.js"
import {
  createKanbanMetricsService,
  mountProjectKanbanMetricsModule,
} from "./modules/project-kanban-metrics/project-kanban-metrics.module.js"
import {
  createFlowTimeService,
  mountProjectCycleLeadTimeModule,
} from "./modules/project-cycle-lead-time/project-cycle-lead-time.module.js"
import {
  createProjectRhythmTrackingService,
  mountProjectRhythmTrackingModule,
} from "./modules/project-rhythm-and-tracking/project-rhythm-tracking.module.js"
import {
  createKanbanBacklogService,
  mountProjectKanbanBacklogModule,
} from "./modules/project-kanban-backlog/project-kanban-backlog.module.js"
import {
  createKanbanFlowService,
  mountProjectKanbanCoreModule,
} from "./modules/project-kanban-core/project-kanban-core.module.js"
import {
  AlignmentSessionsReportService,
  createProjectRuntimeService,
  DeveloperHoursReportService,
  GuidedRefinementSessionsReportService,
  GuidedRetrospectiveSessionsReportService,
  GuidedReviewSessionsReportService,
  GuidedSprintPlanningSessionsReportService,
  mountWorkspaceProjectRuntimeModule,
} from "./modules/workspace-project-runtime/workspace-project-runtime.module.js"
import {
  createWorkTeamsService,
  mountWorkTeamsByProjectRoutesFirst,
  mountWorkspaceWorkTeamsModule,
} from "./modules/workspace-work-teams/workspace-work-teams.module.js"
import {
  createTeamOperationalMetricsService,
  mountTeamOperationalMetricsModule,
} from "./modules/team-operational-metrics/team-operational-metrics.module.js"
import {
  createTeamFlowDeliveryMetricsService,
  mountTeamFlowDeliveryMetricsModule,
} from "./modules/team-flow-delivery-metrics/team-flow-delivery-metrics.module.js"
import {
  createTeamPredictabilityMetricsService,
  mountTeamPredictabilityMetricsModule,
} from "./modules/team-predictability-metrics/team-predictability-metrics.module.js"
import {
  createWorkReadyDoneControlsService,
  mountWorkReadyDoneControlsModule,
} from "./modules/work-ready-done-controls/work-ready-done-controls.module.js"
import {
  createProjectDraftService,
  mountWorkspaceProjectsModule,
} from "./modules/workspace-projects/workspace-projects.module.js"
import {
  createProductIdeaFeedbackEntryService,
  mountProductIdeaFeedbackEntryWorkspaceModule,
} from "./modules/product-idea-feedback/product-idea-feedback.module.js"
import {
  createProductFeedbackService,
  mountProductFeedbackMeModule,
} from "./modules/product-feedback/product-feedback.module.js"
import { mountPlatformUsersModule } from "./modules/platform-users/platform-users.module.js"
import { mountWorkActivityNotificationsModule } from "./modules/work-activity-notifications/work-activity-notifications.module.js"
import { WorkActivityNotificationFanoutService } from "./modules/work-activity-notifications/services/work-activity-notification-fanout.service.js"
import { WorkActivityNotificationQueryService } from "./modules/work-activity-notifications/services/work-activity-notification-query.service.js"
import {
  createPaymentReceiptAccessService,
  createPaymentReceiptWebhookBridge,
} from "./modules/payment-receipts/payment-receipts.module.js"
import type { PlatformUsersService } from "./modules/platform-users/services/platform-users.service.js"
import { createTransactionalEmailService } from "./modules/transactional-email/services/transactional-email.service.js"
import { createHttpRequestLogMiddleware } from "./http-request-log.middleware.js"
import { applyTrustProxyIfConfigured, createGuidedRetrospectiveJoinResolveRateLimiter } from "./http-rate-limit.js"
import { mountDebugSentryRoutesIfEnabled } from "./debug-sentry.routes.js"
import { setupExpressSentry } from "./sentry-config.js"
import { isProductionLikeEnvironment } from "./config/production-environment.js"
import { assertTurnstileSecretRequiredInProduction } from "./infra/turnstile/turnstile-config.js"
import { assertPaddleWebhookSecretEnvNotConfusedWithUrl } from "./integrations/paddle/paddle-webhook-env.js"

const DEFAULT_WEB_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
] as const

/**
 * Orígenes permitidos para el navegador (CORS).
 *
 * En entorno productivo (`VERCEL=1`, `NODE_ENV=production`, etc.) la lista debe ser explícita;
 * no se permite `*` ni valor vacío (coincide con la disciplina previa en Vercel).
 *
 * En desarrollo local, `CORS_ORIGINS=*` acepta cualquier origen; sin variable se usan localhost por defecto.
 */
function corsOriginConfig(): cors.CorsOptions["origin"] {
  const raw = process.env.CORS_ORIGINS?.trim()
  const prodLike = isProductionLikeEnvironment()

  if (prodLike) {
    if (!raw || raw === "*") {
      throw new Error(
        "En entorno productivo CORS_ORIGINS debe ser una lista explícita de orígenes del front (URLs separadas por coma); no uses * ni lo dejes vacío.",
      )
    }
    const list = raw.split(",").map((s) => s.trim()).filter(Boolean)
    if (list.length === 0) {
      throw new Error("CORS_ORIGINS no puede estar vacío en entorno productivo.")
    }
    return list
  }

  if (raw === "*") return true

  const list = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
    : [...DEFAULT_WEB_DEV_ORIGINS]
  return list.length > 0 ? list : true
}

export function createApp(): { app: Express; platformUsersService: PlatformUsersService } {
  const app = express()
  applyTrustProxyIfConfigured(app)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  )
  app.use((_req, res, next) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet")
    next()
  })
  app.get("/robots.txt", (_req, res) => {
    res
      .type("text/plain")
      .send(
        [
          "# Alinea Ágil — API (no indexar). Marketing: https://agil.alineatec.com/",
          "User-agent: *",
          "Disallow: /",
          "",
        ].join("\n"),
      )
  })
  assertTurnstileSecretRequiredInProduction()
  app.use(createHttpRequestLogMiddleware())
  app.use(
    cors({
      origin: corsOriginConfig(),
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Accept", "Authorization", "X-Work-Controls-Override-Id"],
    }),
  )

  const runtimePersistence = createRuntimePersistence()
  const transactionalEmailService = createTransactionalEmailService(
    runtimePersistence.transactionalEmail.ledger,
  )

  const workspaceAuditLogRepository = runtimePersistence.audit.workspaceAudit
  const workspaceLicenseService = createWorkspaceLicenseService(
    workspaceAuditLogRepository,
    runtimePersistence.workspace.license,
  )
  const workspaceMemberRepository = runtimePersistence.workspace.member
  const workspaceCatalogRepository = runtimePersistence.platform.catalog
  const workspaceBillingNotifications = createWorkspaceBillingNotificationService(
    transactionalEmailService,
    workspaceMemberRepository,
    runtimePersistence.billing,
    runtimePersistence.workspace.identity,
  )
  const workspaceBillingStateService = createWorkspaceBillingStateService({
    workspaceLicenseService,
    workspaceMemberRepository,
    billingNotifications: workspaceBillingNotifications,
    workspaceCatalog: workspaceCatalogRepository,
    billing: runtimePersistence.billing,
  })
  const paymentReceiptAccess = createPaymentReceiptAccessService(
    workspaceBillingStateService,
    runtimePersistence.billing,
  )
  const paymentReceiptBridge = createPaymentReceiptWebhookBridge({
    workspaceBillingStateService,
    transactionalEmail: transactionalEmailService,
    workspaceMemberRepository,
    billing: runtimePersistence.billing,
    workspaceIdentity: runtimePersistence.workspace.identity,
  })
  const billingPrimaryProductMutationGate =
    createWorkspaceBillingPrimaryProductMutationGate(workspaceBillingStateService)
  const workspaceBillingPortalService = createWorkspaceBillingPortalService(runtimePersistence.billing)
  const paddleWebhookIngestion = createPaddleBillingWebhookIngestionService({
    workspaceBillingStateService,
    workspaceLicenseService,
    paymentReceiptBridge,
    billing: runtimePersistence.billing,
  })
  assertPaddleWebhookSecretEnvNotConfusedWithUrl()
  mountPaddleBillingWebhookIntegration(app, {
    ingestion: paddleWebhookIngestion,
    webhookSecret: process.env.PADDLE_WEBHOOK_SECRET ?? "",
  })

  app.use(express.json())

  const { loginFlowService, authBearerService, profileUpdateService, passwordResetService } =
    createLoginSessionStack(transactionalEmailService, runtimePersistence.identity)
  const workspaceSeatExpansionGate = createWorkspaceSeatExpansionGate(workspaceBillingStateService)
  const workspaceUserService = createWorkspaceUserService(
    workspaceLicenseService,
    workspaceSeatExpansionGate,
    workspaceAuditLogRepository,
    workspaceMemberRepository,
  )
  const workspaceIdentityRepository = runtimePersistence.workspace.identity
  const registeredUserForAuthRepository = runtimePersistence.identity.registeredUsers
  const workspaceInvitationRepository = runtimePersistence.workspace.invitation
  const workspaceInvitationService = new WorkspaceInvitationService(
    workspaceInvitationRepository,
    workspaceMemberRepository,
    workspaceIdentityRepository,
    workspaceLicenseService,
    workspaceBillingStateService,
    registeredUserForAuthRepository,
    transactionalEmailService,
    workspaceSeatExpansionGate,
  )

  const authMeResolution = new AuthMeResolutionService(
    workspaceMemberRepository,
    workspaceIdentityRepository,
    registeredUserForAuthRepository,
    workspaceBillingStateService,
  )
  const projectRuntimeService = createProjectRuntimeService(
    runtimePersistence.projects.runtime,
    runtimePersistence.workspace,
  )
  const projectRuntimeRepositoryForWorkTeams = runtimePersistence.projects.runtime
  const workTeamsService = createWorkTeamsService(
    projectRuntimeRepositoryForWorkTeams,
    workspaceUserService,
    runtimePersistence.workspace,
    runtimePersistence.audit.workTeamAudit,
  )
  const scrumSprintPlanningRepository = runtimePersistence.scrum.sprintPlanning
  const kanbanFlowService = createKanbanFlowService(
    projectRuntimeService,
    runtimePersistence.kanban.flow,
  )
  const scrumBacklogRepository = runtimePersistence.workItems.backlog
  const workActivityNotificationRepository = runtimePersistence.workItems.notifications
  const workItemImplicitFollowRepository = runtimePersistence.workItems.implicitFollows
  const workActivityNotificationFanout = new WorkActivityNotificationFanoutService(
    workActivityNotificationRepository,
    workItemImplicitFollowRepository,
    workspaceUserService,
    scrumSprintPlanningRepository,
    scrumBacklogRepository,
  )
  const workActivityNotificationQueryService = new WorkActivityNotificationQueryService(
    workActivityNotificationRepository,
    scrumBacklogRepository,
  )
  const sharedImpedimentRepository = runtimePersistence.impediments.impediments
  const workReadyDoneControlsService = createWorkReadyDoneControlsService(
    projectRuntimeService,
    scrumBacklogRepository,
    sharedImpedimentRepository,
    {
      projectProfiles: runtimePersistence.workControls.projectProfile,
      workspaceTemplates: runtimePersistence.workControls.workspaceTemplate,
      overrideTokens: runtimePersistence.workControls.overrideToken,
      workControlsAudit: runtimePersistence.audit.workControlsAudit,
    },
  )
  const scrumCarryoverDerivationService = new ScrumCarryoverDerivationService(scrumSprintPlanningRepository)
  const scrumBacklogService = createScrumBacklogService(
    projectRuntimeService,
    scrumSprintPlanningRepository,
    scrumBacklogRepository,
    workspaceAuditLogRepository,
    workReadyDoneControlsService,
    workActivityNotificationFanout,
  )
  const projectAssignableUsersService = createProjectAssignableUsersService(
    {
      projectRuntime: projectRuntimeRepositoryForWorkTeams,
      projectLinks: runtimePersistence.workspace.workTeamProjectLink,
      teams: runtimePersistence.workspace.workTeam,
      memberships: runtimePersistence.workspace.workTeamMembership,
    },
    workspaceUserService,
  )
  const workItemAssignmentService = createWorkItemAssignmentService(
    scrumBacklogRepository,
    projectRuntimeService,
    workspaceUserService,
    projectAssignableUsersService,
    workspaceAuditLogRepository,
    workActivityNotificationFanout,
  )
  const workItemCommentsService = createWorkItemCommentsService(
    scrumBacklogRepository,
    projectRuntimeService,
    workspaceUserService,
    workActivityNotificationFanout,
    runtimePersistence.workItems.comments,
  )
  const workItemTimeEntriesRepository = runtimePersistence.workItems.timeEntries
  const workItemTimeEntriesService = createWorkItemTimeEntriesService(
    scrumBacklogRepository,
    projectRuntimeService,
    workspaceAuditLogRepository,
    workItemTimeEntriesRepository,
  )
  const developerHoursReportService = new DeveloperHoursReportService(
    projectRuntimeService,
    workItemTimeEntriesRepository,
    scrumSprintPlanningRepository,
    workspaceMemberRepository,
  )
  const alignmentSessionsReportService = new AlignmentSessionsReportService(
    projectRuntimeService,
    runtimePersistence.guidedSessions.dailySession,
    scrumSprintPlanningRepository,
    workspaceMemberRepository,
  )
  const guidedRefinementSessionsReportService = new GuidedRefinementSessionsReportService(
    projectRuntimeService,
    runtimePersistence.guidedSessions.refinementSession,
    runtimePersistence.guidedSessions.refinementReviewedItem,
    scrumBacklogRepository,
    scrumSprintPlanningRepository,
    workspaceMemberRepository,
  )
  const guidedReviewSessionsReportService = new GuidedReviewSessionsReportService(
    projectRuntimeService,
    runtimePersistence.guidedSessions.reviewSession,
    runtimePersistence.guidedSessions.reviewDemonstratedItem,
    runtimePersistence.guidedSessions.reviewFeedback,
    scrumBacklogRepository,
    scrumSprintPlanningRepository,
    workspaceMemberRepository,
  )
  const guidedRetrospectiveSessionsReportService = new GuidedRetrospectiveSessionsReportService(
    projectRuntimeService,
    runtimePersistence.guidedSessions.retroSession,
    runtimePersistence.guidedSessions.retroActionItem,
    scrumSprintPlanningRepository,
    workspaceMemberRepository,
  )
  const guidedSprintPlanningSessionsReportService = new GuidedSprintPlanningSessionsReportService(
    projectRuntimeService,
    runtimePersistence.scrum.guidedSession,
    runtimePersistence.scrum.guidedCandidateItem,
    runtimePersistence.scrum.guidedBaseline,
    scrumBacklogRepository,
    scrumSprintPlanningRepository,
    workspaceMemberRepository,
  )
  const dailyAlignmentService = createDailyAlignmentService(
    projectRuntimeService,
    scrumSprintPlanningRepository,
    workItemTimeEntriesRepository,
    workspaceAuditLogRepository,
    {
      dailySessionRepository: runtimePersistence.guidedSessions.dailySession,
      dailyParticipantUpdateRepository: runtimePersistence.guidedSessions.dailyParticipantUpdate,
    },
  )
  const guidedRefinementService = createGuidedRefinementService(
    projectRuntimeService,
    scrumSprintPlanningRepository,
    scrumBacklogRepository,
    workspaceAuditLogRepository,
    {
      refinementSessionRepository: runtimePersistence.guidedSessions.refinementSession,
      refinementReviewedItemRepository: runtimePersistence.guidedSessions.refinementReviewedItem,
    },
  )
  const guidedReviewService = createGuidedReviewService(
    projectRuntimeService,
    scrumSprintPlanningRepository,
    scrumBacklogRepository,
    workspaceAuditLogRepository,
    {
      reviewSessionRepository: runtimePersistence.guidedSessions.reviewSession,
      reviewDemonstratedItemRepository: runtimePersistence.guidedSessions.reviewDemonstratedItem,
      reviewFeedbackRepository: runtimePersistence.guidedSessions.reviewFeedback,
    },
  )
  const guidedRetrospectiveService = createGuidedRetrospectiveService(
    projectRuntimeService,
    scrumSprintPlanningRepository,
    workspaceAuditLogRepository,
    workActivityNotificationFanout,
    {
      retroSessionRepository: runtimePersistence.guidedSessions.retroSession,
      retroTopicRepository: runtimePersistence.guidedSessions.retroTopic,
      retroContributionRepository: runtimePersistence.guidedSessions.retroContribution,
      retroVoteRepository: runtimePersistence.guidedSessions.retroVote,
      retroActionItemRepository: runtimePersistence.guidedSessions.retroActionItem,
    },
  )
  const sprintPlanningService = createSprintPlanningService(projectRuntimeService, {
    sprintRepo: scrumSprintPlanningRepository,
    backlogRepo: scrumBacklogRepository,
    workControls: workReadyDoneControlsService,
    workActivityNotifications: workActivityNotificationFanout,
  })
  const guidedSprintPlanningService = createGuidedSprintPlanningService({
    projectRuntime: projectRuntimeService,
    sprintPlanningRepository: scrumSprintPlanningRepository,
    backlogRepository: scrumBacklogRepository,
    sprintPlanningService,
    auditLogRepository: workspaceAuditLogRepository,
    refinementReviewedItemRepository: runtimePersistence.guidedSessions.refinementReviewedItem,
    guidedPlanningSessionRepository: runtimePersistence.scrum.guidedSession,
    guidedPlanningCandidateItemRepository: runtimePersistence.scrum.guidedCandidateItem,
    guidedPlanningBaselineRepository: runtimePersistence.scrum.guidedBaseline,
  })
  const sprintBoardService = createSprintBoardService(
    projectRuntimeService,
    workReadyDoneControlsService,
    workspaceAuditLogRepository,
    workActivityNotificationFanout,
    { sprintRepo: scrumSprintPlanningRepository, backlogRepo: scrumBacklogRepository },
  )
  const sprintClosureService = createSprintClosureService(projectRuntimeService, {
    sprintRepo: scrumSprintPlanningRepository,
    backlogRepo: scrumBacklogRepository,
  })
  const sprintMetricsService = createSprintMetricsService(projectRuntimeService, {
    sprintRepo: scrumSprintPlanningRepository,
  })
  const scrumBurndownVelocityService = createScrumBurndownVelocityService({
    projectRuntime: projectRuntimeService,
    sprintRepo: scrumSprintPlanningRepository,
    backlogRepo: scrumBacklogRepository,
    auditRepo: workspaceAuditLogRepository,
    sprintMetrics: sprintMetricsService,
  })
  const sprintReviewService = createSprintReviewService(projectRuntimeService, {
    sprintRepo: scrumSprintPlanningRepository,
  })
  const sprintRetrospectiveService = createSprintRetrospectiveService(projectRuntimeService, {
    sprintRepo: scrumSprintPlanningRepository,
  })
  const projectDraftService = createProjectDraftService(
    projectRuntimeService,
    kanbanFlowService,
    runtimePersistence.projects.draft,
    getPrismaClient(),
  )
  const workspaceSettingsService = createWorkspaceSettingsService(
    runtimePersistence.workspace.settings,
  )
  mountWorkspaceSettingsModule(app, {
    workspaceSettingsService,
    authBearerService,
    workspaceUserService,
  })
  mountWorkspaceLicensesModule(app, {
    workspaceLicenseService,
    authBearerService,
    workspaceUserService,
  })
  const workspaceCommercialSubscriptionService = createWorkspaceCommercialSubscriptionService({
    workspaceBillingStateService: workspaceBillingStateService,
    workspaceLicenseService,
    workspaceMemberRepository,
  })
  mountBillingSeatEnforcementModule(app, {
    billingStateService: workspaceBillingStateService,
    billingPortalService: workspaceBillingPortalService,
    commercialSubscriptionService: workspaceCommercialSubscriptionService,
    authBearerService,
    workspaceUserService,
    workspaceAuditLogRepository,
    paymentReceiptAccess,
  })
  mountWorkspaceUsersModule(app, {
    workspaceUserService,
    workspaceInvitationService,
    authBearerService,
    billingPrimaryProductMutationGate,
  })
  mountWorkspaceInvitationsPublicModule(app, workspaceInvitationService, authBearerService)
  mountWorkReadyDoneControlsModule(app, {
    service: workReadyDoneControlsService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountWorkspaceProjectsModule(app, {
    projectDraftService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountWorkTeamsByProjectRoutesFirst(app, {
    workTeamsService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountProjectWorkAssignmentByProjectRoutesFirst(app, {
    workItemAssignmentService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountWorkspaceProjectRuntimeModule(app, {
    projectRuntimeService,
    projectDraftService,
    developerHoursReportService,
    alignmentSessionsReportService,
    guidedRefinementSessionsReportService,
    guidedReviewSessionsReportService,
    guidedRetrospectiveSessionsReportService,
    guidedSprintPlanningSessionsReportService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountDailyAlignmentModule(app, {
    dailyAlignmentService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountGuidedRefinementModule(app, {
    guidedRefinementService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountGuidedReviewModule(app, {
    guidedReviewService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountGuidedRetrospectiveModule(app, {
    guidedRetrospectiveService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountGuidedSprintPlanningModule(app, {
    guidedSprintPlanningService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  const operatingSnapshotService = createOperatingSnapshotService(projectRuntimeService, runtimePersistence)
  mountOperatingSnapshotModule(app, {
    operatingSnapshotService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountGuidedRetrospectivePublicModule(app, {
    guidedRetrospectiveService,
    joinResolveRateLimit: createGuidedRetrospectiveJoinResolveRateLimiter(),
  })
  mountWorkspaceWorkTeamsModule(app, {
    workTeamsService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  const teamOperationalMetricsService = createTeamOperationalMetricsService(workspaceUserService, {
    teams: runtimePersistence.workspace.workTeam,
    memberships: runtimePersistence.workspace.workTeamMembership,
    projectLinks: runtimePersistence.workspace.workTeamProjectLink,
    backlog: scrumBacklogRepository,
    projectRuntime: projectRuntimeRepositoryForWorkTeams,
    impediments: sharedImpedimentRepository,
  })
  mountTeamOperationalMetricsModule(app, {
    service: teamOperationalMetricsService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  const teamFlowDeliveryMetricsService = createTeamFlowDeliveryMetricsService(projectRuntimeService, {
    teams: runtimePersistence.workspace.workTeam,
    memberships: runtimePersistence.workspace.workTeamMembership,
    projectLinks: runtimePersistence.workspace.workTeamProjectLink,
    sprintMetrics: sprintMetricsService,
    sprintRepo: scrumSprintPlanningRepository,
    backlog: scrumBacklogRepository,
    projectRuntime: projectRuntimeRepositoryForWorkTeams,
  })
  mountTeamFlowDeliveryMetricsModule(app, {
    service: teamFlowDeliveryMetricsService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountProjectKanbanCoreModule(app, {
    kanbanFlowService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  const kanbanBacklogService = createKanbanBacklogService(
    projectRuntimeService,
    kanbanFlowService,
    scrumBacklogRepository,
    workspaceAuditLogRepository,
    workReadyDoneControlsService,
    workActivityNotificationFanout,
  )
  mountProjectKanbanBacklogModule(app, {
    kanbanBacklogService,
    workItemAssignmentService,
    workItemCommentsService,
    workItemTimeEntriesService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  const kanbanBoardService = createKanbanBoardService(
    projectRuntimeService,
    kanbanFlowService,
    kanbanBacklogService,
    scrumBacklogRepository,
    workspaceAuditLogRepository,
    workReadyDoneControlsService,
    workActivityNotificationFanout,
  )
  mountProjectKanbanBoardModule(app, {
    kanbanBoardService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  const kanbanWipConfigService = createKanbanWipConfigService(
    projectRuntimeService,
    kanbanFlowService,
    scrumBacklogRepository,
    workspaceAuditLogRepository,
  )
  mountProjectKanbanWipLimitsModule(app, {
    service: kanbanWipConfigService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  const boardColumnItemMovementService = createBoardColumnItemMovementService(
    projectRuntimeService,
    kanbanFlowService,
    sprintBoardService,
    kanbanBoardService,
    { sprintRepo: scrumSprintPlanningRepository, backlogRepo: scrumBacklogRepository },
  )
  mountBoardColumnItemMovementModule(app, {
    service: boardColumnItemMovementService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  const kanbanMetricsService = createKanbanMetricsService(
    projectRuntimeService,
    kanbanFlowService,
    scrumBacklogRepository,
    workspaceAuditLogRepository,
  )
  mountProjectKanbanMetricsModule(app, {
    kanbanMetricsService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  const flowTimeService = createFlowTimeService(
    projectRuntimeService,
    kanbanFlowService,
    scrumBacklogRepository,
    workspaceAuditLogRepository,
  )
  mountProjectCycleLeadTimeModule(app, {
    flowTimeService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  const teamPredictabilityMetricsService = createTeamPredictabilityMetricsService(projectRuntimeService, {
    teams: runtimePersistence.workspace.workTeam,
    memberships: runtimePersistence.workspace.workTeamMembership,
    projectLinks: runtimePersistence.workspace.workTeamProjectLink,
    kanbanMetrics: kanbanMetricsService,
    sprintMetrics: sprintMetricsService,
    sprintRepo: scrumSprintPlanningRepository,
    projectRuntime: projectRuntimeRepositoryForWorkTeams,
  })
  mountTeamPredictabilityMetricsModule(app, {
    service: teamPredictabilityMetricsService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountProjectScrumBacklogModule(app, {
    scrumBacklogService,
    workItemAssignmentService,
    workItemCommentsService,
    workItemTimeEntriesService,
    authBearerService,
    workspaceUserService,
    carryoverDerivationService: scrumCarryoverDerivationService,
    billingPrimaryProductMutationGate,
  })
  const impedimentService = createImpedimentService(
    projectRuntimeService,
    scrumBacklogRepository,
    scrumSprintPlanningRepository,
    workspaceUserService,
    {
      impedimentRepository: sharedImpedimentRepository,
      auditRepository: runtimePersistence.audit.impedimentAudit,
    },
  )
  const impedimentCommentsService = createProjectImpedimentCommentsService(projectRuntimeService, {
    impedimentRepository: sharedImpedimentRepository,
    commentsRepository: runtimePersistence.impediments.comments,
  })
  mountProjectImpedimentsModule(app, {
    impedimentService,
    impedimentCommentsService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  const projectRhythmTrackingService = createProjectRhythmTrackingService(
    projectRuntimeService,
    scrumSprintPlanningRepository,
    scrumBurndownVelocityService,
    flowTimeService,
    kanbanMetricsService,
    kanbanWipConfigService,
    impedimentService,
    workspaceAuditLogRepository,
  )
  mountProjectRhythmTrackingModule(app, {
    rhythmTrackingService: projectRhythmTrackingService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountProjectScrumSprintPlanningModule(app, {
    sprintPlanningService,
    carryoverDerivationService: scrumCarryoverDerivationService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountProjectScrumSprintBoardModule(app, {
    sprintBoardService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountProjectScrumSprintClosureModule(app, {
    sprintClosureService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountProjectScrumSprintMetricsModule(app, {
    sprintMetricsService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountProjectScrumBurndownVelocityModule(app, {
    service: scrumBurndownVelocityService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountProjectScrumSprintReviewModule(app, {
    sprintReviewService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountProjectScrumSprintRetrospectiveModule(app, {
    sprintRetrospectiveService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountRegistroOnboardingModule(app, {
    runtimePersistence,
    workspaceLicenseService,
    workspaceUserService,
    transactionalEmailService,
    workspaceBillingStateService,
  })
  const productIdeaFeedbackService = createProductIdeaFeedbackEntryService({
    feedback: runtimePersistence.feedback,
    projectRuntime: runtimePersistence.projects.runtime,
  })
  const productFeedbackService = createProductFeedbackService({
    feedback: runtimePersistence.feedback,
    projectRuntime: runtimePersistence.projects.runtime,
  })
  mountProductIdeaFeedbackEntryWorkspaceModule(app, {
    service: productIdeaFeedbackService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountProductFeedbackMeModule(app, {
    service: productFeedbackService,
    authBearerService,
    workspaceUserService,
    billingPrimaryProductMutationGate,
  })
  mountLoginSessionModule(app, {
    loginFlowService,
    authBearerService,
    profileUpdateService,
    passwordResetService,
    authMeResolution,
  })

  mountWorkActivityNotificationsModule(app, {
    queryService: workActivityNotificationQueryService,
    authBearerService,
  })

  const { platformUsersService } = mountPlatformUsersModule(app, {
    transactionalEmailService,
    productIdeaFeedbackService,
    productFeedbackService,
    paymentReceiptAccess,
    workspaceInvitationService,
    billing: runtimePersistence.billing,
    feedback: runtimePersistence.feedback,
    projectRuntime: runtimePersistence.projects.runtime,
    workspaceMembers: runtimePersistence.workspace.member,
    platform: runtimePersistence.platform,
    workspaceLicense: runtimePersistence.workspace.license,
  })

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" })
  })

  mountDebugSentryRoutesIfEnabled(app)

  setupExpressSentry(app)

  const billingSweepMsRaw = process.env.BILLING_NOTIFICATION_SWEEP_MS?.trim()
  const billingSweepMs =
    billingSweepMsRaw === undefined || billingSweepMsRaw === ""
      ? 6 * 60 * 60 * 1000
      : Number(billingSweepMsRaw)
  if (Number.isFinite(billingSweepMs) && billingSweepMs > 0) {
    const tickBillingNotifications = () => {
      const now = new Date()
      void workspaceBillingStateService.sweepExpiredGraceSuspensions(now).catch((err: unknown) =>
        console.error(
          JSON.stringify({
            level: "error",
            msg: "billing_suspension_sweep_failed",
            detail: err instanceof Error ? err.message : String(err),
          }),
        ),
      )
      void workspaceBillingNotifications.runApproachingSuspensionSweep(now).catch((err: unknown) =>
        console.error(
          JSON.stringify({
            level: "error",
            msg: "billing_approaching_suspension_sweep_failed",
            detail: err instanceof Error ? err.message : String(err),
          }),
        ),
      )
    }
    setInterval(tickBillingNotifications, billingSweepMs)
  }

  return { app, platformUsersService }
}
