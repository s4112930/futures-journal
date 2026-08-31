import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.js";

const origin = "https://s4112930.github.io";
const access = {
  ACCESS_TEAM_DOMAIN: "black-dew-606e.cloudflareaccess.com",
  ACCESS_AUD: "test-audience",
  ACCESS_JWKS_URL: "https://jwks.test/certs"
};
const igEnv = {
  ...access,
  IG_API_KEY: "test-api-key",
  IG_IDENTIFIER: "test-identifier",
  IG_PASSWORD: "test-password"
};

function request(path = "/", init = {}) {
  return new Request("https://worker.test" + path, init);
}

function jsonResponse(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

function base64url(value) {
  const bytes = typeof value === "string"
    ? Buffer.from(value)
    : Buffer.from(value);
  return bytes.toString("base64url");
}

let keyPairPromise = crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256"
  },
  true,
  ["sign", "verify"]
);

async function makeAccessToken(overrides = {}) {
  const keyPair = await keyPairPromise;
  const header = { alg: "RS256", typ: "JWT", kid: "test-key" };
  const payload = {
    iss: "https://" + access.ACCESS_TEAM_DOMAIN,
    aud: [access.ACCESS_AUD],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides
  };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const input = encodedHeader + "." + encodedPayload;
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    keyPair.privateKey,
    new TextEncoder().encode(input)
  );
  return input + "." + base64url(new Uint8Array(signature));
}

async function jwksBody() {
  const keyPair = await keyPairPromise;
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  return { keys: [{ ...publicJwk, kid: "test-key", alg: "RS256", use: "sig" }] };
}

function authHeaders(token) {
  return {
    Origin: origin,
    "Cf-Access-Jwt-Assertion": token
  };
}

async function withFetch(handler, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("OPTIONS keeps CORS preflight side-effect free", async () => {
  const response = await worker.fetch(
    request("/", { method: "OPTIONS", headers: { Origin: origin } }),
    {}
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  assert.match(response.headers.get("access-control-allow-methods"), /POST/);
});

test("anonymous IG calls are rejected before any upstream request", async () => {
  let upstreamCalled = false;
  const response = await withFetch(async () => {
    upstreamCalled = true;
    return jsonResponse({});
  }, () => worker.fetch(request("/ig/accounts"), {}));

  assert.equal(response.status, 401);
  assert.equal((await response.json()).ok, false);
  assert.equal(upstreamCalled, false);
});

test("anonymous AI calls are rejected before the model runs", async () => {
  let aiCalled = false;
  const response = await worker.fetch(
    request("/api/analyze", {
      method: "POST",
      body: JSON.stringify({ product: "NQ", direction: "做多" })
    }),
    {
      AI: {
        async run() {
          aiCalled = true;
          return {};
        }
      }
    }
  );

  assert.equal(response.status, 401);
  assert.equal(aiCalled, false);
});

test("forged or removed diagnostic routes are rejected", async () => {
  const forged = await worker.fetch(
    request("/ig/accounts", {
      headers: { "Cf-Access-Authenticated-User-Email": "owner@example.com" }
    }),
    {}
  );
  const oldTest = await worker.fetch(request("/ig/test"), {});
  const oldLoginTest = await worker.fetch(request("/ig/login-test"), {});

  assert.equal(forged.status, 401);
  assert.equal(oldTest.status, 404);
  assert.equal(oldLoginTest.status, 404);
});

test("AI route returns the canonical versioned response schema", async () => {
  const token = await makeAccessToken();
  const response = await withFetch(async (input) => {
    if (String(input) === access.ACCESS_JWKS_URL) return jsonResponse(await jwksBody());
    throw new Error("unexpected AI test fetch: " + String(input));
  }, () => worker.fetch(
    request("/api/analyze", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ product: "NQ", direction: "做多", profit: 25 })
    }),
    {
      ...access,
      AI: {
        async run(model, options) {
          assert.equal(model, "@cf/meta/llama-3.1-8b-instruct-fast");
          assert.equal(options.response_format.type, "json_schema");
          return {
            response: {
              summary: "測試摘要",
              holdingTime: "測試持倉",
              priceChange: "測試價格變化",
              verifiedFactors: ["實際損益已提供"],
              missingData: ["停損資料"]
            }
          };
        }
      }
    }
  ));

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.analysis.schemaVersion, "1.0");
  assert.equal(body.analysis.resultType, "獲利");
  assert.equal(body.analysis.resultSummary, "測試摘要");
  assert.deepEqual(body.analysis.confirmedFactors, ["實際損益已提供"]);
  assert.deepEqual(body.analysis.missingFactors, ["停損資料"]);
  assert.equal(body.analysis.holdingTimeAnalysis, "測試持倉");
});

test("authenticated IG accounts calls preserve the login sequence", async () => {
  const token = await makeAccessToken();
  const calls = [];

  const response = await withFetch(async (input, init) => {
    calls.push({ input: String(input), init });
    if (String(input) === access.ACCESS_JWKS_URL) return jsonResponse(await jwksBody());
    if (String(input).endsWith("/session")) {
      return new Response(JSON.stringify({ currentAccountId: "test-account" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          CST: "test-cst",
          "X-SECURITY-TOKEN": "test-security-token"
        }
      });
    }
    return jsonResponse({ accounts: [{ accountId: "A1" }] });
  }, () => worker.fetch(
    request("/ig/accounts", { headers: authHeaders(token) }),
    igEnv
  ));

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.accounts[0].accountId, "A1");
  assert.equal(calls.length, 3);
  assert.match(calls[1].input, /\/session$/);
  assert.match(calls[2].input, /\/accounts$/);
});

test("IG transactions fetch every page and deduplicates records", async () => {
  const token = await makeAccessToken();
  const calls = [];
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    reference: "T" + index,
    instrumentName: "US TECH 100"
  }));
  const secondPage = [
    { reference: "T99", instrumentName: "US TECH 100" },
    { reference: "T100", instrumentName: "US TECH 100" },
    { reference: "T101", instrumentName: "US TECH 100" }
  ];

  const response = await withFetch(async (input, init) => {
    calls.push({ input: String(input), init });
    if (String(input) === access.ACCESS_JWKS_URL) return jsonResponse(await jwksBody());
    if (String(input).endsWith("/session")) {
      return new Response(JSON.stringify({ currentAccountId: "test-account" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          CST: "test-cst",
          "X-SECURITY-TOKEN": "test-security-token"
        }
      });
    }
    const url = new URL(input);
    const pageNumber = url.searchParams.get("pageNumber");
    return jsonResponse({
      transactions: pageNumber === "1" ? firstPage : secondPage,
      metadata: { pageData: { totalPages: 2, totalElements: 103 } }
    });
  }, () => worker.fetch(
    request("/ig/transactions?from=2026-08-01&to=2026-08-29", {
      headers: authHeaders(token)
    }),
    igEnv
  ));

  const body = await response.json();
  const pageCalls = calls
    .map(call => new URL(call.input))
    .filter(url => url.pathname.endsWith("/history/transactions"));

  assert.equal(response.status, 200);
  assert.equal(body.count, 102);
  assert.equal(body.transactions.length, 102);
  assert.equal(body.metadata.pagesFetched, 2);
  assert.equal(pageCalls.length, 2);
  assert.equal(pageCalls[0].searchParams.get("pageSize"), "100");
  assert.equal(pageCalls[0].searchParams.get("pageNumber"), "1");
  assert.equal(pageCalls[1].searchParams.get("pageNumber"), "2");
});

test("IG temporary upstream errors retry within the configured limit", async () => {
  const token = await makeAccessToken();
  let transactionAttempts = 0;

  const response = await withFetch(async input => {
    if (String(input) === access.ACCESS_JWKS_URL) return jsonResponse(await jwksBody());
    if (String(input).endsWith("/session")) {
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          CST: "test-cst",
          "X-SECURITY-TOKEN": "test-security-token"
        }
      });
    }
    transactionAttempts++;
    if (transactionAttempts === 1) return jsonResponse({ errorCode: "throttle" }, 429);
    return jsonResponse({ transactions: [{ reference: "T1" }] });
  }, () => worker.fetch(
    request("/ig/transactions", { headers: authHeaders(token) }),
    igEnv
  ));

  assert.equal(response.status, 200);
  assert.equal((await response.json()).count, 1);
  assert.equal(transactionAttempts, 2);
});
