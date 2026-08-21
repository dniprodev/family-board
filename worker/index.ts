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

async function findPageId(env: Env, access: Access, token: string) {
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

async function getPage(request: Request, env: Env, access: Access, token: string) {
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

  return jsonResponse({
    access,
    linkItems: items.results,
  });
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

async function createLinkItem(request: Request, env: Env, token: string) {
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
  env: Env,
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

async function deleteLinkItem(env: Env, token: string, itemId: string) {
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
    : new Response(null, { status: 204 });
}

async function reorderLinkItems(request: Request, env: Env, token: string) {
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
      const access = pageRoute[1] as Access;
      const token = pageRoute[2];

      if (request.method === "GET") {
        return getPage(request, env, access, token);
      }

      return methodNotAllowedResponse();
    }

    const reorderRoute = url.pathname.match(
      /^\/api\/edit\/([^/]+)\/items\/reorder$/,
    );

    if (reorderRoute) {
      return request.method === "PATCH"
        ? reorderLinkItems(request, env, reorderRoute[1])
        : methodNotAllowedResponse();
    }

    const itemRoute = url.pathname.match(
      /^\/api\/edit\/([^/]+)\/items(?:\/([^/]+))?$/,
    );

    if (itemRoute) {
      const token = itemRoute[1];
      const itemId = itemRoute[2];

      if (request.method === "POST" && !itemId) {
        return createLinkItem(request, env, token);
      }

      if (request.method === "PATCH" && itemId) {
        return updateLinkItem(request, env, token, itemId);
      }

      if (request.method === "DELETE" && itemId) {
        return deleteLinkItem(env, token, itemId);
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
