import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { test } from "node:test"

import {
  parsePaddleSignatureHeader,
  paddleWebhookTimestampWithinTolerance,
  verifyPaddleWebhookSignature,
} from "./paddle-webhook-signature.js"

test("verifyPaddleWebhookSignature acepta firma HMAC conocida", () => {
  const secret = "pdl_ntfset_test_secret"
  const raw = Buffer.from('{"event_id":"evt_1"}', "utf8")
  const ts = "1672531200"
  const signedPayload = Buffer.concat([Buffer.from(`${ts}:`, "utf8"), raw])
  const h1 = createHmac("sha256", secret).update(signedPayload).digest("hex")
  const header = `ts=${ts};h1=${h1}`
  assert.equal(verifyPaddleWebhookSignature(raw, header, secret), true)
  assert.equal(verifyPaddleWebhookSignature(raw, header, "wrong"), false)
})

test("parsePaddleSignatureHeader extrae ts y h1", () => {
  const p = parsePaddleSignatureHeader("ts=42;h1=abcd")
  assert.ok(p)
  assert.equal(p!.ts, "42")
  assert.equal(p!.h1, "abcd")
})

test("paddleWebhookTimestampWithinTolerance acepta skew moderado", () => {
  const tsSec = String(Math.floor(Date.now() / 1000))
  assert.equal(paddleWebhookTimestampWithinTolerance(tsSec, Date.now(), 600), true)
  assert.equal(paddleWebhookTimestampWithinTolerance("1000000000", Date.now(), 600), false)
})
