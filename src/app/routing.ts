export type Route =
  | { kind: "home" }
  | { kind: "page"; access: "read" | "edit"; token: string }
  | { kind: "not-found" };

const pagePathPattern = /^\/(read|edit)\/([^/]+)$/;

export function isPagePath(path: string) {
  return pagePathPattern.test(path);
}

export function getRoute(): Route {
  const match = window.location.pathname.match(pagePathPattern);

  if (!match) {
    return window.location.pathname === "/"
      ? { kind: "home" }
      : { kind: "not-found" };
  }

  return {
    kind: "page",
    access: match[1] as "read" | "edit",
    token: match[2],
  };
}
