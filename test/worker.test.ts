import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("application boundary", () => {
  it("reports a healthy Worker without requiring bearer-link access", async () => {
    const response = await exports.default.fetch(
      new Request("https://family-board.test/api/health"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
