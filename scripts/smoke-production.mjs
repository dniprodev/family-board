import { pathToFileURL } from "node:url";

const bearerTokenPattern = `[A-Za-z0-9_-]{43}`;
const bearerLinkPattern = new RegExp(
  `(?:https?:\/\/[^\\s/]+)?\/(?:read|edit)\/${bearerTokenPattern}`,
  "g",
);

function redactBearerLinks(message) {
  return String(message).replace(bearerLinkPattern, "/[bearer-link]");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson(response, label) {
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

async function readText(response, label) {
  try {
    return await response.text();
  } catch {
    throw new Error(`${label} returned an unreadable body`);
  }
}

function apiUrl(baseUrl, path) {
  return new URL(path, baseUrl).toString();
}

async function request(fetchImpl, baseUrl, path, init, expectedStatus, label) {
  let response;

  try {
    response = await fetchImpl(apiUrl(baseUrl, path), init);
  } catch {
    throw new Error(`${label} request failed`);
  }

  if (response.status !== expectedStatus) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }

  return response;
}

function tokenFromLink(link, access, expectedOrigin) {
  let url;

  try {
    url = new URL(link);
  } catch {
    throw new Error(`${access} link was invalid`);
  }

  const match = url.pathname.match(
    new RegExp(`^/${access}/(${bearerTokenPattern})$`),
  );

  if (!match) {
    throw new Error(`${access} link was invalid`);
  }

  if (url.origin !== expectedOrigin) {
    throw new Error(`${access} link used an unexpected origin`);
  }

  return match[1];
}

export async function runProductionSmokeTest({
  baseUrl,
  turnstileToken,
  fetchImpl = fetch,
  logger = console,
}) {
  const normalizedBaseUrl = new URL(baseUrl);
  normalizedBaseUrl.pathname = "/";
  normalizedBaseUrl.search = "";
  normalizedBaseUrl.hash = "";
  const origin = normalizedBaseUrl.origin;

  assert(normalizedBaseUrl.protocol === "https:", "the smoke test requires an HTTPS URL");
  assert(turnstileToken, "FAMILY_BOARD_TURNSTILE_TOKEN is required");

  try {
    const health = await request(
      fetchImpl,
      origin,
      "/api/health",
      undefined,
      200,
      "health check",
    );
    const healthBody = await readJson(health, "health check");
    assert(
      healthBody?.status === "ok",
      "health check returned an unexpected status",
    );

    const creation = await request(
      fetchImpl,
      origin,
      "/api/pages",
      {
        method: "POST",
        headers: { "cf-turnstile-response": turnstileToken },
      },
      201,
      "Page creation",
    );
    const links = await readJson(creation, "Page creation");
    assert(
      typeof links?.readLink === "string" && typeof links?.editLink === "string",
      "Page creation did not return both links",
    );

    const readToken = tokenFromLink(links.readLink, "read", origin);
    const editToken = tokenFromLink(links.editLink, "edit", origin);

    const readRoute = await request(
      fetchImpl,
      origin,
      new URL(links.readLink).pathname,
      { headers: { accept: "text/html" } },
      200,
      "Read-link route",
    );
    const readRouteBody = await readText(readRoute, "Read-link route");
    assert(
      readRoute.headers.get("content-type")?.includes("text/html") &&
        readRouteBody.includes("/manifest.webmanifest"),
      "Read-link route did not return the application",
    );

    const editRoute = await request(
      fetchImpl,
      origin,
      new URL(links.editLink).pathname,
      { headers: { accept: "text/html" } },
      200,
      "Edit-link route",
    );
    assert(
      editRoute.headers.get("content-type")?.includes("text/html"),
      "Edit-link route did not return HTML",
    );

    const manifestResponse = await request(
      fetchImpl,
      origin,
      "/manifest.webmanifest",
      undefined,
      200,
      "PWA manifest",
    );
    const manifest = await readJson(manifestResponse, "PWA manifest");
    assert(
      manifest?.display === "standalone" &&
        Array.isArray(manifest.icons) &&
        manifest.icons.length >= 2,
      "PWA manifest is incomplete",
    );

    for (const icon of manifest.icons) {
      assert(typeof icon?.src === "string", "PWA manifest contains an invalid icon");
      await request(
        fetchImpl,
        origin,
        new URL(icon.src, origin).pathname,
        undefined,
        200,
        "PWA icon",
      );
    }

    await request(fetchImpl, origin, "/sw.js", undefined, 200, "PWA service worker");

    const readPath = `/api/read/${readToken}`;
    const editPath = `/api/edit/${editToken}`;
    const itemsPath = `${editPath}/items`;

    const emptyRead = await request(fetchImpl, origin, readPath, undefined, 200, "empty Read-link access");
    const emptyReadBody = await readJson(emptyRead, "empty Read-link access");
    assert(
      emptyReadBody?.access === "read" && Array.isArray(emptyReadBody.linkItems) && emptyReadBody.linkItems.length === 0,
      "Read-link access did not return an empty Page",
    );

    const emptyEdit = await request(fetchImpl, origin, editPath, undefined, 200, "empty Edit-link access");
    const emptyEditBody = await readJson(emptyEdit, "empty Edit-link access");
    assert(
      emptyEditBody?.access === "edit" && Array.isArray(emptyEditBody.linkItems) && emptyEditBody.linkItems.length === 0,
      "Edit-link access did not return an empty Page",
    );

    await request(
      fetchImpl,
      origin,
      `/api/edit/${readToken}/items`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Read-link must remain read-only",
          destinationUrl: "https://example.com/family-board-read-only",
        }),
      },
      404,
      "Read-link write rejection",
    );

    const createdItemResponse = await request(
      fetchImpl,
      origin,
      itemsPath,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Family Board smoke test",
          destinationUrl: "https://example.com/family-board-smoke",
        }),
      },
      201,
      "Link item creation",
    );
    const createdItemBody = await readJson(createdItemResponse, "Link item creation");
    const itemId = createdItemBody?.linkItem?.id;
    assert(typeof itemId === "string" && itemId.length > 0, "Link item creation did not return an item");

    await request(
      fetchImpl,
      origin,
      `${itemsPath}/${encodeURIComponent(itemId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Family Board smoke test updated",
          destinationUrl: "https://example.com/family-board-smoke-updated",
        }),
      },
      200,
      "Link item update",
    );

    await request(
      fetchImpl,
      origin,
      `${itemsPath}/reorder`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemIds: [itemId] }),
      },
      200,
      "Link item reorder",
    );

    const persistedRead = await request(fetchImpl, origin, readPath, undefined, 200, "persisted Read-link access");
    const persistedReadBody = await readJson(persistedRead, "persisted Read-link access");
    const persistedItem = persistedReadBody?.linkItems?.[0];
    assert(
      persistedItem?.id === itemId &&
        persistedItem.title === "Family Board smoke test updated" &&
        persistedItem.destinationUrl === "https://example.com/family-board-smoke-updated",
      "Link item changes were not persisted",
    );

    await request(
      fetchImpl,
      origin,
      `${itemsPath}/${encodeURIComponent(itemId)}`,
      { method: "DELETE" },
      204,
      "Link item deletion",
    );

    const finalRead = await request(fetchImpl, origin, readPath, undefined, 200, "final Read-link access");
    const finalReadBody = await readJson(finalRead, "final Read-link access");
    assert(
      Array.isArray(finalReadBody?.linkItems) && finalReadBody.linkItems.length === 0,
      "Link item deletion was not persisted",
    );

    const rotation = await request(
      fetchImpl,
      origin,
      `${editPath}/rotate`,
      { method: "POST" },
      200,
      "Edit-link rotation",
    );
    const rotatedLinks = await readJson(rotation, "Edit-link rotation");
    const rotatedEditToken = tokenFromLink(rotatedLinks?.editLink, "edit", origin);

    await request(fetchImpl, origin, editPath, undefined, 404, "revoked Edit-link access");
    await request(
      fetchImpl,
      origin,
      `/api/edit/${rotatedEditToken}`,
      undefined,
      200,
      "rotated Edit-link access",
    );
    await request(fetchImpl, origin, readPath, undefined, 200, "Read-link after rotation");

    logger.log("Production smoke test passed: health, bearer-link access, and disposable Link item persistence verified.");
  } catch (error) {
    const message = redactBearerLinks(
      error instanceof Error ? error.message : "unknown failure",
    );
    logger.error(`Production smoke test failed: ${message}`);
    throw new Error(message);
  }
}

async function main() {
  const baseUrl = process.argv[2] ?? process.env.FAMILY_BOARD_URL;
  const turnstileToken = process.env.FAMILY_BOARD_TURNSTILE_TOKEN;

  if (!baseUrl || !turnstileToken) {
    console.error(
      "Usage: FAMILY_BOARD_TURNSTILE_TOKEN=<token> npm run smoke:production -- https://family-board.<subdomain>.workers.dev",
    );
    process.exitCode = 1;
    return;
  }

  await runProductionSmokeTest({ baseUrl, turnstileToken });
}

const currentScript = process.argv[1] && pathToFileURL(process.argv[1]).href;

if (currentScript === import.meta.url) {
  await main();
}
