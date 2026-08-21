type WorkerEnv = Cloudflare.Env & { ASSETS: Fetcher };

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
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};
const safeNoBodyHeaders = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

const readPagePath = /^\/read(?:\/|$)/;
const bearerPagePath = /^\/(?:read|edit)(?:\/|$)/;
const turnstileSiteverifyUrl =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const turnstileAction = "create-page";

const tokenEncoder = new TextEncoder();

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...extraHeaders },
  });
}

function notFoundResponse() {
  return jsonResponse({ error: "Page not found" }, 404);
}

function methodNotAllowedResponse() {
  return jsonResponse({ error: "Method not allowed" }, 405);
}

function rateLimitedResponse() {
  return jsonResponse({ error: "Too many requests" }, 429);
}

function unavailableResponse() {
  return jsonResponse({ error: "Service temporarily unavailable" }, 503);
}

function clientKey(request: Request) {
  return request.headers.get("CF-Connecting-IP") ?? "unknown-client";
}

async function allowRequest(
  limiter: RateLimit | undefined,
  key: string,
) {
  if (!limiter) {
    return "unavailable" as const;
  }

  try {
    return (await limiter.limit({ key })).success
      ? ("allowed" as const)
      : ("limited" as const);
  } catch {
    return "unavailable" as const;
  }
}

function configuredHostnames(env: WorkerEnv) {
  return new Set(
    (env.TURNSTILE_HOSTNAMES ?? "")
      .split(",")
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function verifyTurnstile(request: Request, env: WorkerEnv) {
  const token = request.headers.get("cf-turnstile-response");
  const expectedHostnames = configuredHostnames(env);

  if (
    !env.TURNSTILE_SECRET ||
    !token ||
    token.length > 2048 ||
    expectedHostnames.size === 0
  ) {
    return false;
  }

  const form = new URLSearchParams({
    secret: env.TURNSTILE_SECRET,
    response: token,
  });
  const remoteIp = request.headers.get("CF-Connecting-IP");

  if (remoteIp) {
    form.set("remoteip", remoteIp);
  }

  try {
    const response = await fetch(turnstileSiteverifyUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return false;
    }

    const result = (await response.json()) as {
      success?: unknown;
      action?: unknown;
      hostname?: unknown;
    };

    return (
      result.success === true &&
      result.action === turnstileAction &&
      typeof result.hostname === "string" &&
      expectedHostnames.has(result.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
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

async function createPage(request: Request, env: WorkerEnv) {
  const rateLimit = await allowRequest(
    env.CREATE_RATE_LIMITER,
    `create:${clientKey(request)}`,
  );

  if (rateLimit !== "allowed") {
    return rateLimit === "limited"
      ? rateLimitedResponse()
      : unavailableResponse();
  }

  if (!(await verifyTurnstile(request, env))) {
    return jsonResponse({ error: "Page could not be created" }, 403);
  }

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

async function findPageId(env: WorkerEnv, access: Access, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return null;
  }

  const tokenHash = await hashToken(token);
  const tokenColumn = access === "read" ? "read_token_hash" : "edit_token_hash";
  const page = await env.DB.prepare(
    `SELECT id FROM pages WHERE ${tokenColumn} = ?1`,
  )
    .bind(tokenHash)
    .first<{ id: string }>();

  return page?.id ?? null;
}

async function getPage(request: Request, env: WorkerEnv, access: Access, token: string) {
  const pageId = await findPageId(env, access, token);

  if (!pageId) {
    return notFoundResponse();
  }

  const items = await env.DB.prepare(
    `SELECT id, title, destination_url AS destinationUrl, position
     FROM link_items
     WHERE page_id = ?1
     ORDER BY position ASC, created_at ASC`,
  )
    .bind(pageId)
    .all<LinkItem>();

  return jsonResponse(
    {
      access,
      linkItems: items.results,
    },
    200,
    access === "read" ? { "X-Robots-Tag": "noindex, nofollow" } : {},
  );
}

async function editApiRateLimitFailure(
  request: Request,
  env: WorkerEnv,
) {
  const rateLimit = await allowRequest(
    env.EDIT_API_RATE_LIMITER,
    `edit-api:${clientKey(request)}`,
  );

  if (rateLimit === "allowed") {
    return null;
  }

  return rateLimit === "limited"
    ? rateLimitedResponse()
    : unavailableResponse();
}

function validateLinkItem(title: unknown, destinationUrl: unknown) {
  if (typeof title !== "string" || typeof destinationUrl !== "string") {
    return null;
  }

  const trimmedTitle = title.trim();
  const trimmedUrl = destinationUrl.trim();

  if (!trimmedTitle || !trimmedUrl) {
    return null;
  }

  try {
    const url = new URL(trimmedUrl);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }

  return { title: trimmedTitle, destinationUrl: trimmedUrl };
}

async function parseJson(request: Request) {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}

function invalidLinkItemResponse() {
  return jsonResponse(
    { error: "Link item title and destination URL are required" },
    400,
  );
}

async function createLinkItem(request: Request, env: WorkerEnv, token: string) {
  const pageId = await findPageId(env, "edit", token);
  const body = await parseJson(request);

  if (!pageId || !body || typeof body !== "object") {
    return pageId ? invalidLinkItemResponse() : notFoundResponse();
  }

  const input = validateLinkItem(
    "title" in body ? body.title : undefined,
    "destinationUrl" in body ? body.destinationUrl : undefined,
  );

  if (!input) {
    return invalidLinkItemResponse();
  }

  const position = await env.DB.prepare(
    "SELECT COALESCE(MAX(position) + 1, 0) AS position FROM link_items WHERE page_id = ?1",
  )
    .bind(pageId)
    .first<{ position: number }>();
  const linkItem: LinkItem = {
    id: crypto.randomUUID(),
    ...input,
    position: position?.position ?? 0,
  };

  await env.DB.prepare(
    `INSERT INTO link_items (id, page_id, title, destination_url, position)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(
      linkItem.id,
      pageId,
      linkItem.title,
      linkItem.destinationUrl,
      linkItem.position,
    )
    .run();

  return jsonResponse({ linkItem }, 201);
}

async function updateLinkItem(
  request: Request,
  env: WorkerEnv,
  token: string,
  itemId: string,
) {
  const pageId = await findPageId(env, "edit", token);

  if (!pageId) {
    return notFoundResponse();
  }

  const currentItem = await env.DB.prepare(
    `SELECT id, title, destination_url AS destinationUrl, position
     FROM link_items WHERE id = ?1 AND page_id = ?2`,
  )
    .bind(itemId, pageId)
    .first<LinkItem>();

  if (!currentItem) {
    return notFoundResponse();
  }

  const body = await parseJson(request);

  if (
    !body ||
    typeof body !== "object" ||
    (!("title" in body) && !("destinationUrl" in body))
  ) {
    return invalidLinkItemResponse();
  }

  const input = validateLinkItem(
    "title" in body ? body.title : currentItem.title,
    "destinationUrl" in body ? body.destinationUrl : currentItem.destinationUrl,
  );

  if (!input) {
    return invalidLinkItemResponse();
  }

  const linkItem = { ...currentItem, ...input };

  await env.DB.prepare(
    `UPDATE link_items
     SET title = ?1, destination_url = ?2
     WHERE id = ?3 AND page_id = ?4`,
  )
    .bind(linkItem.title, linkItem.destinationUrl, itemId, pageId)
    .run();

  return jsonResponse({ linkItem });
}

async function deleteLinkItem(env: WorkerEnv, token: string, itemId: string) {
  const pageId = await findPageId(env, "edit", token);

  if (!pageId) {
    return notFoundResponse();
  }

  const result = await env.DB.prepare(
    "DELETE FROM link_items WHERE id = ?1 AND page_id = ?2",
  )
    .bind(itemId, pageId)
    .run();

  return result.meta.changes === 0
    ? notFoundResponse()
    : new Response(null, { status: 204, headers: safeNoBodyHeaders });
}

async function reorderLinkItems(request: Request, env: WorkerEnv, token: string) {
  const pageId = await findPageId(env, "edit", token);

  if (!pageId) {
    return notFoundResponse();
  }

  const body = await parseJson(request);

  if (
    !body ||
    typeof body !== "object" ||
    !("itemIds" in body) ||
    !Array.isArray(body.itemIds) ||
    !body.itemIds.every((id) => typeof id === "string")
  ) {
    return jsonResponse({ error: "A complete Link item order is required" }, 400);
  }

  const currentItems = await env.DB.prepare(
    "SELECT id FROM link_items WHERE page_id = ?1 ORDER BY position ASC, created_at ASC",
  )
    .bind(pageId)
    .all<{ id: string }>();
  const currentIds = currentItems.results.map((item) => item.id);
  const requestedIds = body.itemIds;

  if (
    requestedIds.length !== currentIds.length ||
    new Set(requestedIds).size !== requestedIds.length ||
    requestedIds.some((id) => !currentIds.includes(id))
  ) {
    return jsonResponse({ error: "A complete Link item order is required" }, 400);
  }

  await env.DB.batch(
    requestedIds.map((id, position) =>
      env.DB.prepare(
        "UPDATE link_items SET position = ?1 WHERE id = ?2 AND page_id = ?3",
      ).bind(position, id, pageId),
    ),
  );

  return jsonResponse({ success: true });
}

async function rotateEditLink(request: Request, env: WorkerEnv, token: string) {
  const pageId = await findPageId(env, "edit", token);

  if (!pageId) {
    return notFoundResponse();
  }

  const editToken = createToken();
  const editTokenHash = await hashToken(editToken);
  const result = await env.DB.prepare(
    "UPDATE pages SET edit_token_hash = ?1 WHERE id = ?2",
  )
    .bind(editTokenHash, pageId)
    .run();

  if (result.meta.changes === 0) {
    return notFoundResponse();
  }

  return jsonResponse({
    editLink: `${new URL(request.url).origin}/edit/${editToken}`,
  });
}

async function serveAssets(request: Request, env: WorkerEnv, url: URL) {
  const assetRequest =
    request.method === "GET" && bearerPagePath.test(url.pathname)
      ? new Request(new URL("/", request.url), request)
      : request;
  const response = await env.ASSETS.fetch(assetRequest);
  const headers = new Headers(response.headers);

  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set(
    "content-security-policy",
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; " +
      "frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; " +
      "style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
  );

  if (bearerPagePath.test(url.pathname)) {
    headers.set("cache-control", "no-store");
  }

  if (readPagePath.test(url.pathname)) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

const worker: ExportedHandler<WorkerEnv> = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return jsonResponse({ status: "ok" });
    }

    if (url.pathname === "/api/config") {
      return request.method === "GET"
        ? jsonResponse({ turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? null })
        : methodNotAllowedResponse();
    }

    if (url.pathname === "/api/pages") {
      return request.method === "POST"
        ? createPage(request, env)
        : methodNotAllowedResponse();
    }

    const pageRoute = url.pathname.match(/^\/api\/(read|edit)\/([^/]+)$/);

    if (pageRoute) {
      const access = pageRoute[1] as Access;
      const token = pageRoute[2];

      if (request.method === "GET") {
        if (access === "edit") {
          const failure = await editApiRateLimitFailure(request, env);

          if (failure) {
            return failure;
          }
        }

        return getPage(request, env, access, token);
      }

      return methodNotAllowedResponse();
    }

    const reorderRoute = url.pathname.match(
      /^\/api\/edit\/([^/]+)\/items\/reorder$/,
    );

    if (reorderRoute) {
      if (request.method !== "PATCH") {
        return methodNotAllowedResponse();
      }

      const failure = await editApiRateLimitFailure(request, env);

      return failure ?? reorderLinkItems(request, env, reorderRoute[1]);
    }

    const rotateRoute = url.pathname.match(/^\/api\/edit\/([^/]+)\/rotate$/);

    if (rotateRoute) {
      if (request.method !== "POST") {
        return methodNotAllowedResponse();
      }

      const failure = await editApiRateLimitFailure(request, env);

      return failure ?? rotateEditLink(request, env, rotateRoute[1]);
    }

    const itemRoute = url.pathname.match(
      /^\/api\/edit\/([^/]+)\/items(?:\/([^/]+))?$/,
    );

    if (itemRoute) {
      const token = itemRoute[1];
      const itemId = itemRoute[2];

      if (request.method === "POST" && !itemId) {
        const failure = await editApiRateLimitFailure(request, env);

        return failure ?? createLinkItem(request, env, token);
      }

      if (request.method === "PATCH" && itemId) {
        const failure = await editApiRateLimitFailure(request, env);

        return failure ?? updateLinkItem(request, env, token, itemId);
      }

      if (request.method === "DELETE" && itemId) {
        const failure = await editApiRateLimitFailure(request, env);

        return failure ?? deleteLinkItem(env, token, itemId);
      }

      return methodNotAllowedResponse();
    }

    if (env.ASSETS) {
      return serveAssets(request, env, url);
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
};

export default worker;
