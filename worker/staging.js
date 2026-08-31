import apiWorker from "./index.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "futures-journal-staging",
        sameOriginApi: true,
        sensitiveRoutesEnabled: true
      });
    }

    if (
      url.pathname.startsWith("/ig/") ||
      url.pathname === "/api/analyze"
    ) {
      return apiWorker.fetch(request, env, ctx);
    }

    return env.ASSETS.fetch(request);
  }
};
