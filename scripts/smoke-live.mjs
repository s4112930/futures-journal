import assert from "node:assert/strict";

const pagesUrl = "https://s4112930.github.io/futures-journal/";
const workerUrl = "https://futures-ai-worker.s4112930.workers.dev/";

const pagesResponse = await fetch(pagesUrl, { redirect: "follow" });
assert.equal(pagesResponse.status, 200, "GitHub Pages must remain available");

const workerResponse = await fetch(workerUrl, { method: "OPTIONS" });
assert.ok(
  workerResponse.status === 200 || workerResponse.status === 204,
  `legacy Worker OPTIONS returned ${workerResponse.status}`
);
assert.equal(
  workerResponse.headers.get("access-control-allow-origin"),
  "https://s4112930.github.io"
);

console.log(`pages=${pagesResponse.status}`);
console.log(`legacy-worker-options=${workerResponse.status}`);
