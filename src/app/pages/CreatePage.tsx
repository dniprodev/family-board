import { useState } from "react";
import { LinkRow } from "../components/LinkRow";
import { SiteHeader } from "../components/SiteHeader";
import type { PageLinks } from "../types";

type CreateStatus = "idle" | "creating" | "error";

export function CreatePage() {
  const [links, setLinks] = useState<PageLinks | null>(null);
  const [status, setStatus] = useState<CreateStatus>("idle");

  async function handleCreate() {
    setStatus("creating");

    try {
      const response = await fetch("/api/pages", { method: "POST" });

      if (!response.ok) {
        throw new Error("Page creation failed");
      }

      setLinks((await response.json()) as PageLinks);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <main className="site-page site-page-home">
      <div className="site-container site-container-home">
        <SiteHeader />

        <section className="home-introduction">
          <p className="eyebrow">A shared page of links</p>
          <h1 className="home-title">Keep the useful things close.</h1>
          <p className="home-description">
            Create a Page and get separate Read and Edit links. No account or
            password is needed.
          </p>
        </section>

        <section className="create-panel">
          <div className="create-panel-heading">
            <div>
              <h2 className="create-panel-title">Start a new Page</h2>
              <p className="create-panel-description">
                Keep both links somewhere safe. Anyone with a link can use its
                access.
              </p>
            </div>
            <button
              className="primary-button"
              disabled={status === "creating"}
              onClick={handleCreate}
              type="button"
            >
              {status === "creating" ? "Creating…" : "Create Page"}
            </button>
          </div>

          {status === "error" && (
            <p className="error-message" role="alert">
              The Page could not be created. Please try again.
            </p>
          )}

          {links && (
            <div className="page-links">
              <p className="page-links-title">Your Page links</p>
              <LinkRow label="Read link" link={links.readLink} />
              <LinkRow label="Edit link" link={links.editLink} />
            </div>
          )}
        </section>

        <footer className="site-footer site-footer-home">
          Save your Edit link before leaving this page. It is the only way to
          return as the Editor.
        </footer>
      </div>
    </main>
  );
}
