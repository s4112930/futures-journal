const base = String(process.env.STAGING_URL || "").replace(/\/$/, "");

if (!base) {
  throw new Error("請先設定 STAGING_URL，例如：https://example.workers.dev");
}

const home = await fetch(base + "/", { redirect: "follow" });
const homeText = await home.text();

if (!home.ok || !homeText.includes("期貨交易日誌")) {
  throw new Error("staging 首頁驗證失敗：HTTP " + home.status);
}

if (homeText.includes("https://futures-ai-worker.s4112930.workers.dev")) {
  throw new Error("staging 首頁仍指向舊 Worker，未達成同源 API。");
}

const health = await fetch(base + "/health", {
  headers: { Accept: "application/json" }
});
const healthText = await health.text();
let healthBody = {};
try { healthBody = JSON.parse(healthText); } catch {}

if (!health.ok || healthBody.ok !== true || healthBody.sameOriginApi !== true) {
  throw new Error("staging health 驗證失敗：HTTP " + health.status);
}

const blocked = await fetch(base + "/api/analyze", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ product: "NQ", direction: "做多" })
});
const blockedText = await blocked.text();
let blockedBody = {};
try { blockedBody = JSON.parse(blockedText); } catch {}

if (blocked.ok && blockedBody.ok === true) {
  throw new Error("未授權敏感 staging API 不應成功。");
}

const fallback = await fetch(base + "/staging-smoke-route", {
  headers: { "Sec-Fetch-Mode": "navigate" }
});
const fallbackText = await fallback.text();

if (!fallback.ok || !fallbackText.includes("期貨交易日誌")) {
  throw new Error("SPA fallback 驗證失敗：HTTP " + fallback.status);
}

console.log("staging smoke passed");
