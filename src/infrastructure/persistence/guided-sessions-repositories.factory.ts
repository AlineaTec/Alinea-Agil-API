import type { PrismaClient } from "@prisma/client"
import type { DailyAlignmentParticipantUpdateRepository } from "../../modules/daily-alignment/persistence/daily-alignment-participant-update.repository.js"
import { DailyAlignmentParticipantUpdatePrismaRepository } from "../../modules/daily-alignment/persistence/prisma/daily-alignment-participant-update.prisma-repository.js"
import type { DailyAlignmentSessionRepository } from "../../modules/daily-alignment/persistence/daily-alignment-session.repository.js"
import { DailyAlignmentSessionPrismaRepository } from "../../modules/daily-alignment/persistence/prisma/daily-alignment-session.prisma-repository.js"
import type { GuidedRefinementReviewedItemRepository } from "../../modules/guided-refinement/persistence/guided-refinement-reviewed-item.repository.js"
import type { GuidedRefinementSessionRepository } from "../../modules/guided-refinement/persistence/guided-refinement-session.repository.js"
import { GuidedRefinementReviewedItemPrismaRepository } from "../../modules/guided-refinement/persistence/prisma/guided-refinement-reviewed-item.prisma-repository.js"
import { GuidedRefinementSessionPrismaRepository } from "../../modules/guided-refinement/persistence/prisma/guided-refinement-session.prisma-repository.js"
import type { GuidedRetrospectiveActionItemRepository } from "../../modules/guided-retrospective/persistence/guided-retrospective-action-item.repository.js"
import type { GuidedRetrospectiveContributionRepository } from "../../modules/guided-retrospective/persistence/guided-retrospective-contribution.repository.js"
import type { GuidedRetrospectiveSessionRepository } from "../../modules/guided-retrospective/persistence/guided-retrospective-session.repository.js"
import type { GuidedRetrospectiveTopicRepository } from "../../modules/guided-retrospective/persistence/guided-retrospective-topic.repository.js"
import type { GuidedRetrospectiveVoteRepository } from "../../modules/guided-retrospective/persistence/guided-retrospective-vote.repository.js"
import { GuidedRetrospectiveActionItemPrismaRepository } from "../../modules/guided-retrospective/persistence/prisma/guided-retrospective-action-item.prisma-repository.js"
import { GuidedRetrospectiveContributionPrismaRepository } from "../../modules/guided-retrospective/persistence/prisma/guided-retrospective-contribution.prisma-repository.js"
import { GuidedRetrospectiveSessionPrismaRepository } from "../../modules/guided-retrospective/persistence/prisma/guided-retrospective-session.prisma-repository.js"
import { GuidedRetrospectiveTopicPrismaRepository } from "../../modules/guided-retrospective/persistence/prisma/guided-retrospective-topic.prisma-repository.js"
import { GuidedRetrospectiveVotePrismaRepository } from "../../modules/guided-retrospective/persistence/prisma/guided-retrospective-vote.prisma-repository.js"
import type { GuidedReviewDemonstratedItemRepository } from "../../modules/guided-review/persistence/guided-review-demonstrated-item.repository.js"
import type { GuidedReviewFeedbackRepository } from "../../modules/guided-review/persistence/guided-review-feedback.repository.js"
import type { GuidedReviewSessionRepository } from "../../modules/guided-review/persistence/guided-review-session.repository.js"
import { GuidedReviewDemonstratedItemPrismaRepository } from "../../modules/guided-review/persistence/prisma/guided-review-demonstrated-item.prisma-repository.js"
import { GuidedReviewFeedbackPrismaRepository } from "../../modules/guided-review/persistence/prisma/guided-review-feedback.prisma-repository.js"
import { GuidedReviewSessionPrismaRepository } from "../../modules/guided-review/persistence/prisma/guided-review-session.prisma-repository.js"
import { getPrismaClient } from "../postgres/prisma-client.js"
import {
  type PersistenceDriver,
} from "./persistence-driver.js"

export type GuidedSessionsRepositories = {
  driver: PersistenceDriver
  dailySession: DailyAlignmentSessionRepository
  dailyParticipantUpdate: DailyAlignmentParticipantUpdateRepository
  refinementSession: GuidedRefinementSessionRepository
  refinementReviewedItem: GuidedRefinementReviewedItemRepository
  reviewSession: GuidedReviewSessionRepository
  reviewDemonstratedItem: GuidedReviewDemonstratedItemRepository
  reviewFeedback: GuidedReviewFeedbackRepository
  retroSession: GuidedRetrospectiveSessionRepository
  retroTopic: GuidedRetrospectiveTopicRepository
  retroContribution: GuidedRetrospectiveContributionRepository
  retroVote: GuidedRetrospectiveVoteRepository
  retroActionItem: GuidedRetrospectiveActionItemRepository
}

export function createGuidedSessionsRepositories(
  prismaClient?: PrismaClient,
): GuidedSessionsRepositories {
  const prisma = prismaClient ?? getPrismaClient()
  return {
    driver: "postgres",
    dailySession: new DailyAlignmentSessionPrismaRepository(prisma),
      dailyParticipantUpdate: new DailyAlignmentParticipantUpdatePrismaRepository(prisma),
      refinementSession: new GuidedRefinementSessionPrismaRepository(prisma),
      refinementReviewedItem: new GuidedRefinementReviewedItemPrismaRepository(prisma),
      reviewSession: new GuidedReviewSessionPrismaRepository(prisma),
      reviewDemonstratedItem: new GuidedReviewDemonstratedItemPrismaRepository(prisma),
      reviewFeedback: new GuidedReviewFeedbackPrismaRepository(prisma),
      retroSession: new GuidedRetrospectiveSessionPrismaRepository(prisma),
      retroTopic: new GuidedRetrospectiveTopicPrismaRepository(prisma),
      retroContribution: new GuidedRetrospectiveContributionPrismaRepository(prisma),
      retroVote: new GuidedRetrospectiveVotePrismaRepository(prisma),
      retroActionItem: new GuidedRetrospectiveActionItemPrismaRepository(prisma),
  }
}
