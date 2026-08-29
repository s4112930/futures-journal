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
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "futures-journal-staging",
        sameOriginApi: true,
        sensitiveRoutesEnabled: false
      });
    }

    if (
      url.pathname.startsWith("/ig/") ||
      url.pathname === "/api/analyze"
    ) {
      return json(
        {
          ok: false,
          error: "Sensitive staging routes remain disabled until Cloudflare Access is configured."
        },
        503
      );
    }

    return env.ASSETS.fetch(request);
  }
};
