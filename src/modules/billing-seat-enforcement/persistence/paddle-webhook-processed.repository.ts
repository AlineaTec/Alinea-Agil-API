export interface PaddleWebhookProcessedRepository {
  /**
   * @returns `true` si este `event_id` se reclama por primera vez; `false` si ya existía (retry Paddle).
   */
  tryClaimEvent(eventId: string, meta: { eventType: string; receivedAt: Date }): Promise<boolean>
}
