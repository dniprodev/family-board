import { useEffect, useState } from "react";
import { SiteHeader } from "../components/SiteHeader";
import type { PageResponse } from "../types";

type PageViewProps = {
  access: "read" | "edit";
  token: string;
};

export function PageView({ access, token }: PageViewProps) {
  const [page, setPage] = useState<PageResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (access !== "read") {
      return;
    }

    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.appendChild(robots);

    return () => {
      robots.remove();
    };
  }, [access]);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/${access}/${encodeURIComponent(token)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Page could not be loaded");
        }

        return (await response.json()) as PageResponse;
      })
      .then(setPage)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setFailed(true);
      });

    return () => controller.abort();
  }, [access, token]);

  return (
    <main className="site-page site-page-reader">
      <div className="site-container">
        <SiteHeader />

        <section className="page-content">
          <p className="eyebrow">{access === "read" ? "Read link" : "Edit link"}</p>
          <h1 className="page-title">Family Board</h1>

          {!page && !failed && <p className="loading-message">Loading Page…</p>}

          {failed && (
            <div className="error-panel" role="alert">
              This link is invalid or the Page is unavailable.
            </div>
          )}

          {page && page.linkItems.length === 0 && (
            <div className="empty-panel">
              <h2 className="empty-panel-title">
                {access === "read" ? "Nothing here yet" : "This Page is empty"}
              </h2>
              <p className="empty-panel-description">
                {access === "read"
                  ? "The Editor has not added any Link items yet. Check back later."
                  : "The Editor tools will be available here in the next step."}
              </p>
            </div>
          )}

          {page && page.linkItems.length > 0 && (
            <ul className="page-item-list">
              {page.linkItems.map((item) => (
                <li key={item.id}>
                  <a
                    className="page-item-link"
                    href={item.destinationUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {item.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
