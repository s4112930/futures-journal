import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import stagingWorker from "../worker/staging.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function assetsEnv() {
  return {
    ASSETS: {
      async fetch(request) {
        return new Response(`asset:${new URL(request.url).pathname}`, { status: 200 });
      }
    }
  };
}

test("staging build rewrites API calls to same origin and removes legacy Worker URL", async () => {
  execFileSync(process.execPath, ["scripts/build-staging.mjs"], {
    cwd: root,
    stdio: "pipe"
  });

  const html = await readFile(join(root, "dist", "index.html"), "utf8");

  assert.match(html, /const API =\s*window\.location\.origin;/);
  assert.match(html, /const AI_API =\s*API \+ "\/api\/analyze";/);
  assert.doesNotMatch(html, /futures-ai-worker\.s4112930\.workers\.dev/);
  assert.match(html, /noindex,nofollow,noarchive/);
});

test("staging config uses Static Assets SPA routing without production secrets", async () => {
  const config = JSON.parse(
    await readFile(join(root, "worker", "wrangler.staging.jsonc"), "utf8")
  );

  assert.equal(config.main, "staging.js");
  assert.equal(config.assets.directory, "../dist");
  assert.equal(config.assets.binding, "ASSETS");
  assert.equal(config.assets.not_found_handling, "single-page-application");
  assert.deepEqual(config.assets.run_worker_first, ["/health", "/ig/*", "/api/*"]);
  assert.equal("ai" in config, false);
  assert.equal("vars" in config, false);
});

test("staging health is available while sensitive routes stay disabled", async () => {
  const env = assetsEnv();

  const health = await stagingWorker.fetch(
    new Request("https://staging.test/health"),
    env
  );
  const healthBody = await health.json();

  assert.equal(health.status, 200);
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.sameOriginApi, true);
  assert.equal(healthBody.sensitiveRoutesEnabled, false);

  for (const path of ["/ig/accounts", "/ig/transactions", "/api/analyze"]) {
    const response = await stagingWorker.fetch(
      new Request(`https://staging.test${path}`, { method: path === "/api/analyze" ? "POST" : "GET" }),
      env
    );
    assert.equal(response.status, 503);
  }
});

test("non-API staging requests fall through to Static Assets", async () => {
  const response = await stagingWorker.fetch(
    new Request("https://staging.test/client-route"),
    assetsEnv()
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "asset:/client-route");
});
