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
});
