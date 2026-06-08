import assert from "node:assert/strict"
import { test } from "node:test"

import { assertPaddleWebhookSecretEnvNotConfusedWithUrl } from "./paddle-webhook-env.js"

test("rechaza PADDLE_WEBHOOK_SECRET que sea una URL https", () => {
  const prev = process.env.PADDLE_WEBHOOK_SECRET
  process.env.PADDLE_WEBHOOK_SECRET = "https://api.example.com/v1/integrations/paddle/webhooks"
  try {
    assert.throws(
      () => assertPaddleWebhookSecretEnvNotConfusedWithUrl(),
      /no debe ser la URL del webhook/,
    )
  } finally {
    if (prev === undefined) delete process.env.PADDLE_WEBHOOK_SECRET
    else process.env.PADDLE_WEBHOOK_SECRET = prev
  }
})

test("vacío o secreto tipo texto no lanza", () => {
  const prev = process.env.PADDLE_WEBHOOK_SECRET
  process.env.PADDLE_WEBHOOK_SECRET = "pdl_ntfset_test_abc"
  try {
    assert.doesNotThrow(() => assertPaddleWebhookSecretEnvNotConfusedWithUrl())
  } finally {
    if (prev === undefined) delete process.env.PADDLE_WEBHOOK_SECRET
    else process.env.PADDLE_WEBHOOK_SECRET = prev
  }
})
