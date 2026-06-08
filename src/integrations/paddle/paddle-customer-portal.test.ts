import assert from "node:assert/strict"
import test from "node:test"

import { createPaddleCustomerPortalSession } from "./paddle-customer-portal.js"

const origFetch = globalThis.fetch

test.afterEach(() => {
  globalThis.fetch = origFetch
})

test("createPaddleCustomerPortalSession lee urls.general.overview (formato actual Paddle)", async () => {
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const u = String(input)
    assert.match(u, /\/customers\/ctm_test\/portal-sessions/)
    return new Response(
      JSON.stringify({
        data: {
          id: "cpls_x",
          customer_id: "ctm_test",
          urls: {
            general: {
              overview:
                "https://customer-portal.paddle.com/cpl_x?action=overview&token=pga_test_token_value",
            },
            subscriptions: [],
          },
          created_at: "2024-11-12T15:13:21Z",
        },
        meta: { request_id: "req-test-1" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  }

  const r = await createPaddleCustomerPortalSession("ctm_test", "pdl_live_apikey_test", {
    origin: "https://api.paddle.com",
    subscriptionIds: ["sub_abc"],
  })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.ok(r.portalUrl.includes("customer-portal.paddle.com"))
    assert.ok(r.portalUrl.includes("token=pga_test_token_value"))
  }
})

test("createPaddleCustomerPortalSession acepta urls.general string (legacy)", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: {
          urls: {
            general: "https://customer-portal.paddle.com/cpl_legacy?token=old",
          },
        },
        meta: {},
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )

  const r = await createPaddleCustomerPortalSession("ctm_x", "k", {
    origin: "https://api.paddle.com",
  })
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.portalUrl, "https://customer-portal.paddle.com/cpl_legacy?token=old")
})
