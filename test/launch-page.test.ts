import { describe, expect, it } from "vitest";
import {
  clearSavedLaunchPage,
  getSavedLaunchPage,
  saveLaunchPage,
} from "../src/app/launch-page";

function createStorage() {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as Storage;
}

describe("saved launch Page", () => {
  it("stores and clears a valid Read or Edit link path", () => {
    const storage = createStorage();
    const readPath = `/read/${"r".repeat(43)}`;

    saveLaunchPage(readPath, storage);
    expect(getSavedLaunchPage(storage)).toBe(readPath);

    clearSavedLaunchPage(storage);
    expect(getSavedLaunchPage(storage)).toBeNull();
  });

  it("ignores paths that are not Family Board Page links", () => {
    const storage = createStorage();

    saveLaunchPage("/", storage);
    expect(getSavedLaunchPage(storage)).toBeNull();
  });
});
