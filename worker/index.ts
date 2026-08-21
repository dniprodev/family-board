interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
}

type Access = "read" | "edit";

type LinkItem = {
  id: string;
  title: string;
  destinationUrl: string;
  position: number;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const readPagePath = /^\/read(?:\/|$)/;

const tokenEncoder = new TextEncoder();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

function notFoundResponse() {
  return jsonResponse({ error: "Page not found" }, 404);
}

function methodNotAllowedResponse() {
  return jsonResponse({ error: "Method not allowed" }, 405);
}

function encodeToken(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function createToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encodeToken(bytes);
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    tokenEncoder.encode(token),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function createPage(request: Request, env: Env) {
  const readToken = createToken();
  const editToken = createToken();
  const [readTokenHash, editTokenHash] = await Promise.all([
    hashToken(readToken),
    hashToken(editToken),
  ]);
  const pageId = crypto.randomUUID();

  try {
    await env.DB.prepare(
      `INSERT INTO pages (id, read_token_hash, edit_token_hash)
       VALUES (?1, ?2, ?3)`,
    )
      .bind(pageId, readTokenHash, editTokenHash)
      .run();
  } catch {
    return jsonResponse({ error: "Page could not be created" }, 500);
  }

  const origin = new URL(request.url).origin;

  return jsonResponse(
    {
      readLink: `${origin}/read/${readToken}`,
      editLink: `${origin}/edit/${editToken}`,
    },
    201,
  );
}

async function getPage(request: Request, env: Env, access: Access, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return notFoundResponse();
  }

  const tokenHash = await hashToken(token);
  const tokenColumn = access === "read" ? "read_token_hash" : "edit_token_hash";
  const page = await env.DB.prepare(
    `SELECT id FROM pages WHERE ${tokenColumn} = ?1`,
  )
    .bind(tokenHash)
    .first<{ id: string }>();

  if (!page) {
    return notFoundResponse();
  }

  const items = await env.DB.prepare(
    `SELECT id, title, destination_url AS destinationUrl, position
     FROM link_items
     WHERE page_id = ?1
     ORDER BY position ASC, created_at ASC`,
  )
    .bind(page.id)
    .all<LinkItem>();

  return jsonResponse({
    access,
    linkItems: items.results,
  });
}

async function serveAssets(request: Request, env: Env, url: URL) {
  const response = await env.ASSETS.fetch(request);

  if (!readPagePath.test(url.pathname)) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

const worker: ExportedHandler<Env> = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return jsonResponse({ status: "ok" });
    }

    if (url.pathname === "/api/pages") {
      return request.method === "POST"
        ? createPage(request, env)
        : methodNotAllowedResponse();
    }

    const pageRoute = url.pathname.match(/^\/api\/(read|edit)\/([^/]+)$/);

    if (pageRoute) {
      if (request.method !== "GET") {
        return methodNotAllowedResponse();
      }

      return getPage(request, env, pageRoute[1] as Access, pageRoute[2]);
    }

    if (env.ASSETS) {
      return serveAssets(request, env, url);
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
};

export default worker;
