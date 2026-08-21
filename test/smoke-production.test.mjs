import { describe, expect, it, vi } from "vitest";
import { runProductionSmokeTest } from "../scripts/smoke-production.mjs";

const baseUrl = "https://family-board.example";
const readToken = "r".repeat(43);
const editToken = "e".repeat(43);
const rotatedEditToken = "n".repeat(43);
const itemId = "item-1";

function response(body, status = 200, headers = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("production smoke test", () => {
  it("verifies the disposable Page lifecycle without logging bearer links", async () => {
    const calls = [];
    let readCount = 0;
    let rotated = false;
    const fetchImpl = vi.fn(async (input, init) => {
      const url = new URL(input);
      calls.push({ method: init?.method ?? "GET", pathname: url.pathname });

      if (url.pathname === "/api/health") {
        return response({ status: "ok" });
      }

      if (url.pathname === "/api/config") {
        return response({ turnstileSiteKey: "1x00000000000000000000AA" });
      }

      if (url.pathname === "/api/pages") {
        return response(
          {
            readLink: `${baseUrl}/read/${readToken}`,
            editLink: `${baseUrl}/edit/${editToken}`,
          },
          201,
        );
      }

      if (url.pathname === `/read/${readToken}` || url.pathname === `/edit/${editToken}`) {
        return new Response(
          '<!doctype html><link rel="manifest" href="/manifest.webmanifest">',
          { headers: { "content-type": "text/html" } },
        );
      }

      if (url.pathname === "/manifest.webmanifest") {
        return response({
          id: "/",
          start_url: "/",
          scope: "/",
          launch_handler: { client_mode: "navigate-existing" },
          display: "standalone",
          icons: [
            { src: "/icons/family-board-192.png" },
            { src: "/icons/family-board-512.png" },
          ],
        });
      }

      if (url.pathname.startsWith("/icons/")) {
        return new Response("png", {
          headers: { "content-type": "image/png" },
        });
      }

      if (url.pathname === "/sw.js") {
        return new Response("self.addEventListener('fetch', () => {});", {
          headers: { "content-type": "application/javascript" },
        });
      }

      if (url.pathname === `/api/read/${readToken}`) {
        readCount += 1;
        return response(
          readCount === 1
            ? { access: "read", linkItems: [] }
            : readCount === 2
              ? {
                  access: "read",
                  linkItems: [
                    {
                      id: itemId,
                      title: "Family Board smoke test updated",
                      destinationUrl: "https://example.com/family-board-smoke-updated",
                      position: 0,
                    },
                  ],
                }
              : { access: "read", linkItems: [] },
        );
      }

      if (url.pathname === `/api/edit/${editToken}` && rotated) {
        return response({ error: "Page not found" }, 404);
      }

      if (url.pathname === `/api/edit/${editToken}`) {
        return response({ access: "edit", linkItems: [] });
      }

      if (url.pathname === `/api/edit/${rotatedEditToken}`) {
        return response({ access: "edit", linkItems: [] });
      }

      if (url.pathname === `/api/edit/${readToken}/items`) {
        return response({ error: "Page not found" }, 404);
      }

      if (url.pathname === `/api/edit/${editToken}/items` && init?.method === "POST") {
        return response(
          {
            linkItem: {
              id: itemId,
              title: "Smoke test link",
              destinationUrl: "https://example.com/smoke",
              position: 0,
            },
          },
          201,
        );
      }

      if (url.pathname === `/api/edit/${editToken}/items/${itemId}` && init?.method === "PATCH") {
        return response({ success: true });
      }

      if (url.pathname === `/api/edit/${editToken}/items/reorder`) {
        return response({ success: true });
      }

      if (url.pathname === `/api/edit/${editToken}/rotate`) {
        rotated = true;
        return response({
          editLink: `${baseUrl}/edit/${rotatedEditToken}`,
        });
      }

      if (url.pathname === `/api/edit/${editToken}/items/${itemId}` && init?.method === "DELETE") {
        return response(undefined, 204);
      }

      throw new Error(`unexpected request: ${url.pathname}`);
    });
    const logger = { log: vi.fn(), error: vi.fn() };

    await runProductionSmokeTest({
      baseUrl,
      turnstileToken: "turnstile-token",
      fetchImpl,
      logger,
    });

    expect(calls.map(({ method, pathname }) => `${method} ${pathname}`)).toEqual([
      "GET /api/health",
      "GET /api/config",
      "POST /api/pages",
      `GET /read/${readToken}`,
      `GET /edit/${editToken}`,
      "GET /manifest.webmanifest",
      "GET /icons/family-board-192.png",
      "GET /icons/family-board-512.png",
      "GET /sw.js",
      `GET /api/read/${readToken}`,
      `GET /api/edit/${editToken}`,
      `POST /api/edit/${readToken}/items`,
      `POST /api/edit/${editToken}/items`,
      `PATCH /api/edit/${editToken}/items/${itemId}`,
      "PATCH /api/edit/" + editToken + "/items/reorder",
      `GET /api/read/${readToken}`,
      `DELETE /api/edit/${editToken}/items/${itemId}`,
      `GET /api/read/${readToken}`,
      `POST /api/edit/${editToken}/rotate`,
      `GET /api/edit/${editToken}`,
      `GET /api/edit/${rotatedEditToken}`,
      `GET /api/read/${readToken}`,
    ]);

    const output = logger.log.mock.calls.flat().join(" ");
    expect(readCount).toBe(4);
    expect(output).not.toContain(readToken);
    expect(output).not.toContain(editToken);
    expect(output).not.toContain("/read/");
    expect(output).not.toContain("/edit/");
  });

  it("reports failures without echoing response details or bearer credentials", async () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const fetchImpl = vi.fn(async () =>
      response({
        error: `Page not found at /read/${readToken}`,
      }, 404),
    );

    await expect(
      runProductionSmokeTest({
        baseUrl,
        turnstileToken: "turnstile-token",
        fetchImpl,
        logger,
      }),
    ).rejects.toThrow("health check returned HTTP 404");

    const output = logger.error.mock.calls.flat().join(" ");
    expect(output).not.toContain(readToken);
    expect(output).not.toContain("/read/");
  });
});
