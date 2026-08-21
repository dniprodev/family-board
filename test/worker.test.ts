import { exports } from "cloudflare:workers";
import { env } from "cloudflare:workers";
import { reset } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  const response = await request("/api/pages", { method: "POST" });

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
  });

  afterEach(async () => {
    await reset();
  });

  it("reports a healthy Worker without requiring bearer-link access", async () => {
    const response = await exports.default.fetch(
      new Request("https://family-board.test/api/health"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ status: "ok" });
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

  it("shows an empty Page through its Read link", async () => {
    const links = await createPage();
    const readToken = new URL(links.readLink).pathname.split("/").pop();

    const response = await request(`/api/read/${readToken}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      access: "read",
      linkItems: [],
    });
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

  it("does not reveal a Page for an unknown Read link", async () => {
    const response = await request(`/api/read/${"a".repeat(43)}`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Page not found" });
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

    const edit = await request(`/api/edit/${editToken}`);
    expect((await edit.json()).linkItems).toHaveLength(1);
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
    const readMutation = await request(`/api/read/${readToken}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Nope",
        destinationUrl: "https://example.com",
      }),
    });

    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      error: "Link item title and destination URL are required",
    });
    expect(readMutation.status).toBe(404);
  });
});
