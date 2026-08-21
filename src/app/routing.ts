export type Route =
  | { kind: "home" }
  | { kind: "page"; access: "read" | "edit"; token: string }
  | { kind: "not-found" };

export function getRoute(): Route {
  const match = window.location.pathname.match(/^\/(read|edit)\/([^/]+)$/);

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
