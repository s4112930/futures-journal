import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.js";

const origin = "https://s4112930.github.io";

function request(path = "/", init = {}) {
  return new Request(`https://worker.test${path}`, init);
}

function igSessionResponse() {
  return new Response(JSON.stringify({ currentAccountId: "test-account" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      CST: "test-cst",
      "X-SECURITY-TOKEN": "test-security-token"
    }
  });
}

test("OPTIONS keeps the legacy CORS contract", async () => {
  const response = await worker.fetch(request("/", { method: "OPTIONS" }), {});

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  assert.match(response.headers.get("access-control-allow-methods"), /POST/);
});

test("non-IG GET requests remain method-not-allowed", async () => {
  const response = await worker.fetch(request("/"), {});
  const body = await response.json();

  assert.equal(response.status, 405);
  assert.equal(body.ok, false);
});

test("AI route rejects a trade without product or direction", async () => {
  const response = await worker.fetch(
    request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: "NQ" })
    }),
    { AI: { run: async () => assert.fail("AI should not run") } }
  );

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /交易方向/);
});

test("AI route keeps the model call and structured response contract", async () => {
  let invocation;
  const analysis = {
    summary: "測試摘要",
    holdingTime: "測試",
    priceChange: "測試",
    entryAnalysis: "測試",
    exitAnalysis: "測試",
    riskManagement: "測試",
    verifiedFactors: [],
    missingData: [],
    objectiveConclusion: "測試"
  };

  const response = await worker.fetch(
    request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: "NQ", direction: "多" })
    }),
    {
      AI: {
        async run(model, options) {
          invocation = { model, options };
          return { response: analysis };
        }
      }
    }
  );

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.analysis, analysis);
  assert.equal(invocation.model, "@cf/meta/llama-3.1-8b-instruct-fast");
  assert.equal(invocation.options.response_format.type, "json_schema");
});

test("IG accounts route keeps the login and account request sequence", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init) => {
    calls.push({ input: String(input), init });
    if (String(input).endsWith("/session")) return igSessionResponse();
    return new Response(JSON.stringify({ accounts: [{ accountId: "A1" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const response = await worker.fetch(request("/ig/accounts"), {
      IG_API_KEY: "test-api-key",
      IG_IDENTIFIER: "test-identifier",
      IG_PASSWORD: "test-password"
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.accounts[0].accountId, "A1");
    assert.equal(calls.length, 2);
    assert.match(calls[0].input, /\/session$/);
    assert.match(calls[1].input, /\/accounts$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("IG transactions route preserves dates and current page settings", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init) => {
    calls.push({ input: String(input), init });
    if (String(input).endsWith("/session")) return igSessionResponse();
    return new Response(
      JSON.stringify({ transactions: [{ reference: "T1" }], metadata: {} }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const response = await worker.fetch(
      request("/ig/transactions?from=2026-08-01&to=2026-08-29"),
      {
        IG_API_KEY: "test-api-key",
        IG_IDENTIFIER: "test-identifier",
        IG_PASSWORD: "test-password"
      }
    );
    const body = await response.json();
    const transactionsUrl = new URL(calls[1].input);

    assert.equal(response.status, 200);
    assert.equal(body.count, 1);
    assert.equal(transactionsUrl.searchParams.get("from"), "2026-08-01");
    assert.equal(transactionsUrl.searchParams.get("to"), "2026-08-29");
    assert.equal(transactionsUrl.searchParams.get("pageSize"), "100");
    assert.equal(transactionsUrl.searchParams.get("pageNumber"), "1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
