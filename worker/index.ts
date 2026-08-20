interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
}

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const worker: ExportedHandler<Env> = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: jsonHeaders,
      });
    }

    return env.ASSETS.fetch(request);
  },
};

export default worker;
