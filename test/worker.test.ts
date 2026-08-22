import { exports } from "cloudflare:workers";
import { env } from "cloudflare:workers";
import { reset } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import initialMigration from "../migrations/0001_initial.sql?raw";

type PageLinks = {
  readLink: string;
  editLink: string;
};

async function request(path: string, init?: RequestInit) {
  return exports.default.fetch(
    new Request(`https://family-board.test${path}`, init),
  );
}

async function createPage(): Promise<PageLinks> {
  const response = await request("/api/pages", {
    method: "POST",
    headers: { "cf-turnstile-response": "valid-test-token" },
  });

  expect(response.status).toBe(201);
  expect(response.headers.get("content-type")).toContain("application/json");

  return response.json() as Promise<PageLinks>;
}

describe("application boundary", () => {
  beforeEach(async () => {
    for (const statement of initialMigration
      .split(";")
      .map((query) => query.trim())
      .filter(Boolean)) {
      await env.DB.prepare(statement).run();
    }

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (input.toString() !== "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
          throw new Error("unexpected external request");
        }

        return new Response(
          JSON.stringify({
            success: true,
            action: "create-page",
            hostname: "family-board.test",
          }),
          { headers: { "content-type": "application/json" } },
        );
      }),
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await reset();
  });

  it("rejects Page creation without a valid Turnstile challenge", async () => {
    const response = await request("/api/pages", { method: "POST" });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Page could not be created",
    });
  });

  it("rejects a Turnstile response with the wrong action or hostname", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: true,
            action: "wrong-action",
            hostname: "unexpected.example",
          }),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const response = await request("/api/pages", {
      method: "POST",
      headers: { "cf-turnstile-response": "invalid-test-token" },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Page could not be created",
    });
  });

  it("rejects an expired or replayed Turnstile response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: false,
            "error-codes": ["timeout-or-duplicate"],
          }),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const token = "expired-test-token";
    const response = await request("/api/pages", {
      method: "POST",
      headers: { "cf-turnstile-response": token },
    });

    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(token);
  });

  it("reports a healthy Worker without requiring bearer-link access", async () => {
    const response = await exports.default.fetch(
      new Request("https://family-board.test/api/health"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("exposes only the public challenge configuration", async () => {
    const response = await request("/api/config");

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toEqual({
      turnstileSiteKey: "1x00000000000000000000AA",
    });
    expect(JSON.stringify(body)).not.toContain(
      "1x0000000000000000000000000000000AA",
    );
  });

  it("protects Edit-link application responses from caching and referrers", async () => {
    const response = await exports.default.fetch(
      new Request(`https://family-board.test/edit/${"a".repeat(43)}`),
    );

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("serves the application shell through bearer-link routes", async () => {
    const response = await exports.default.fetch(
      new Request(`https://family-board.test/read/${"a".repeat(43)}`, {
        headers: { accept: "text/html" },
      }),
    );

    const body = await response.text();

    expect({ status: response.status, body }).toEqual({
      status: 200,
      body: expect.stringContaining("/manifest.webmanifest"),
    });
    expect(response.headers.get("content-type")).toContain("text/html");
  });

  it("creates a Page with separate unguessable Read and Edit links", async () => {
    const links = await createPage();
    const readUrl = new URL(links.readLink);
    const editUrl = new URL(links.editLink);

    expect(readUrl.pathname).toMatch(/^\/read\/[A-Za-z0-9_-]{43}$/);
    expect(editUrl.pathname).toMatch(/^\/edit\/[A-Za-z0-9_-]{43}$/);
    expect(readUrl.pathname).not.toBe(editUrl.pathname);
    expect(links.readLink).not.toContain(links.editLink);
  });

  it("shows an empty Page through its Read link without a challenge", async () => {
    const links = await createPage();
    const readToken = new URL(links.readLink).pathname.split("/").pop();

    const response = await request(`/api/read/${readToken}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      access: "read",
      linkItems: [],
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("recognizes the separate Edit link without exposing it as Read access", async () => {
    const links = await createPage();
    const readToken = new URL(links.readLink).pathname.split("/").pop();
    const editToken = new URL(links.editLink).pathname.split("/").pop();

    const response = await request(`/api/edit/${editToken}`);
    const readTokenWithEditRoute = await request(`/api/edit/${readToken}`);
    const editTokenWithReadRoute = await request(`/api/read/${editToken}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      access: "edit",
      linkItems: [],
    });
    expect(readTokenWithEditRoute.status).toBe(404);
    expect(editTokenWithReadRoute.status).toBe(404);
  });

  it("rotates the Edit link while keeping the Read link working", async () => {
    const links = await createPage();
    const readToken = new URL(links.readLink).pathname.split("/").pop();
    const oldEditToken = new URL(links.editLink).pathname.split("/").pop();

    const rotation = await request(`/api/edit/${oldEditToken}/rotate`, {
      method: "POST",
    });

    expect(rotation.status).toBe(200);
    const rotatedLinks = (await rotation.json()) as { editLink: string };
    const newEditToken = new URL(rotatedLinks.editLink).pathname.split("/").pop();

    expect(rotatedLinks.editLink).toMatch(
      /^https:\/\/family-board\.test\/edit\/[A-Za-z0-9_-]{43}$/,
    );
    expect(newEditToken).not.toBe(oldEditToken);
    expect(JSON.stringify(rotatedLinks)).not.toContain(oldEditToken);

    const oldEditResponse = await request(`/api/edit/${oldEditToken}`);
    const newEditResponse = await request(`/api/edit/${newEditToken}`);
    const readResponse = await request(`/api/read/${readToken}`);

    expect(oldEditResponse.status).toBe(404);
    expect(await oldEditResponse.json()).toEqual({ error: "Page not found" });
    expect(newEditResponse.status).toBe(200);
    expect(readResponse.status).toBe(200);

    const newEditMutation = await request(`/api/edit/${newEditToken}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Rotated access",
        destinationUrl: "https://example.com/rotated",
      }),
    });
    const oldEditMutation = await request(`/api/edit/${oldEditToken}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Revoked access",
        destinationUrl: "https://example.com/revoked",
      }),
    });

    expect(newEditMutation.status).toBe(201);
    expect(oldEditMutation.status).toBe(404);
  });

  it("does not let a Read link or unknown Edit link rotate an Edit link", async () => {
    const links = await createPage();
    const readToken = new URL(links.readLink).pathname.split("/").pop();
    const unknownToken = "a".repeat(43);

    const readRotation = await request(`/api/edit/${readToken}/rotate`, {
      method: "POST",
    });
    const unknownRotation = await request(`/api/edit/${unknownToken}/rotate`, {
      method: "POST",
    });

    expect(readRotation.status).toBe(404);
    expect(unknownRotation.status).toBe(404);
    expect(await unknownRotation.text()).not.toContain(unknownToken);
  });

  it("does not reveal a Page for an unknown Read or Edit link", async () => {
    const unknownToken = "a".repeat(43);
    const response = await request(`/api/read/${unknownToken}`);
    const editResponse = await request(`/api/edit/${unknownToken}`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Page not found" });
    expect(editResponse.status).toBe(404);
    expect(await editResponse.text()).not.toContain(unknownToken);
  });

  it("lets an Editor create, edit, reorder, and delete Link items", async () => {
    const links = await createPage();
    const editToken = new URL(links.editLink).pathname.split("/").pop();
    const readToken = new URL(links.readLink).pathname.split("/").pop();

    const firstCreate = await request(`/api/edit/${editToken}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Family calendar",
        destinationUrl: "https://calendar.example.com",
      }),
    });
    const secondCreate = await request(`/api/edit/${editToken}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Grocery list",
        destinationUrl: "https://groceries.example.com",
      }),
    });

    expect(firstCreate.status).toBe(201);
    expect(secondCreate.status).toBe(201);
    const firstItem = (await firstCreate.json()).linkItem;
    const secondItem = (await secondCreate.json()).linkItem;

    expect(firstItem.createdAt).toEqual(expect.any(String));
    expect(secondItem.createdAt).toEqual(expect.any(String));
    expect(secondItem.position).toBe(0);
    expect(firstItem.position).toBe(0);

    const newestFirst = await request(`/api/edit/${editToken}`);
    expect((await newestFirst.json()).linkItems).toMatchObject([
      { id: secondItem.id, position: 0 },
      { id: firstItem.id, position: 1 },
    ]);

    const update = await request(
      `/api/edit/${editToken}/items/${firstItem.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Updated calendar",
          destinationUrl: "https://calendar.example.com/family",
        }),
      },
    );
    expect(update.status).toBe(200);

    const reorder = await request(`/api/edit/${editToken}/items/reorder`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemIds: [secondItem.id, firstItem.id] }),
    });
    expect(reorder.status).toBe(200);

    const read = await request(`/api/read/${readToken}`);
    expect(read.status).toBe(200);
    expect((await read.json()).linkItems).toMatchObject([
      {
        id: secondItem.id,
        title: "Grocery list",
        destinationUrl: "https://groceries.example.com",
        position: 0,
      },
      {
        id: firstItem.id,
        title: "Updated calendar",
        destinationUrl: "https://calendar.example.com/family",
        position: 1,
      },
    ]);

    const deletion = await request(
      `/api/edit/${editToken}/items/${secondItem.id}`,
      { method: "DELETE" },
    );
    expect(deletion.status).toBe(204);
    expect(deletion.headers.get("cache-control")).toBe("no-store");
    expect(deletion.headers.get("referrer-policy")).toBe("no-referrer");

    const edit = await request(`/api/edit/${editToken}`);
    expect((await edit.json()).linkItems).toHaveLength(1);
  });

  it("allows a Link item to use its URL as its display title", async () => {
    const links = await createPage();
    const editToken = new URL(links.editLink).pathname.split("/").pop();
    const response = await request(`/api/edit/${editToken}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "",
        destinationUrl: "https://example.com/no-title",
      }),
    });

    expect(response.status).toBe(201);
    expect((await response.json()).linkItem).toMatchObject({
      title: "",
      destinationUrl: "https://example.com/no-title",
    });
  });

  it("rejects invalid Link items and keeps the Read link read-only", async () => {
    const links = await createPage();
    const editToken = new URL(links.editLink).pathname.split("/").pop();
    const readToken = new URL(links.readLink).pathname.split("/").pop();
    const invalid = await request(`/api/edit/${editToken}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "", destinationUrl: "javascript:alert(1)" }),
    });
    const readMutation = await request(`/api/edit/${readToken}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Nope",
        destinationUrl: "https://example.com",
      }),
    });

    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      error: "Link item destination URL is required",
    });
    expect(readMutation.status).toBe(404);
  });
});
