import { useEffect, useRef, useState } from "react";
import { SiteHeader } from "../components/SiteHeader";
import type { PageResponse } from "../types";

type PageViewProps = {
  access: "read" | "edit";
  token: string;
};

type SaveState = "saved" | "saving" | "error";

type SaveEntry = {
  run: () => Promise<void>;
};

function isSavable(item: { title: string; destinationUrl: string }) {
  if (!item.title.trim() || !item.destinationUrl.trim()) {
    return false;
  }

  try {
    const url = new URL(item.destinationUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function PageView({ access, token }: PageViewProps) {
  const [page, setPage] = useState<PageResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<SaveEntry | null>(null);
  const failedSave = useRef<SaveEntry | null>(null);

  function queueSave(run: () => Promise<void>) {
    const entry = { run };
    pendingSave.current = entry;
    failedSave.current = null;
    setSaveState("saving");

    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }

    saveTimer.current = setTimeout(() => {
      void executeSave(entry);
    }, 500);
  }

  async function executeSave(entry: SaveEntry) {
    try {
      await entry.run();

      if (pendingSave.current !== entry) {
        return;
      }

      failedSave.current = null;
      setSaveState("saved");
    } catch {
      if (pendingSave.current !== entry) {
        return;
      }

      failedSave.current = entry;
      setSaveState("error");
    }
  }

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

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, []);

  function updateItem(itemId: string, field: "title" | "destinationUrl", value: string) {
    if (!page || access !== "edit") {
      return;
    }

    const item = page.linkItems.find((candidate) => candidate.id === itemId);

    if (!item) {
      return;
    }

    const nextItem = { ...item, [field]: value };
    setPage({ ...page, linkItems: page.linkItems.map((candidate) =>
      candidate.id === itemId ? nextItem : candidate,
    ) });

    if (!isSavable(nextItem)) {
      return;
    }

    const itemPath = `/api/edit/${encodeURIComponent(token)}/items`;

    if (itemId.startsWith("draft-")) {
      const submitted = {
        title: nextItem.title,
        destinationUrl: nextItem.destinationUrl,
      };
      queueSave(async () => {
        const response = await fetch(itemPath, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(submitted),
        });

        if (!response.ok) {
          throw new Error("Link item could not be saved");
        }

        const result = (await response.json()) as { linkItem: PageResponse["linkItems"][number] };
        setPage((currentPage) => {
          if (!currentPage) {
            return currentPage;
          }

          return {
            ...currentPage,
            linkItems: currentPage.linkItems.map((candidate) =>
              candidate.id === itemId
                ? { ...candidate, id: result.linkItem.id }
                : candidate,
            ),
          };
        });
      });
      return;
    }

    queueSave(async () => {
      const response = await fetch(`${itemPath}/${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: nextItem.title,
          destinationUrl: nextItem.destinationUrl,
        }),
      });

      if (!response.ok) {
        throw new Error("Link item could not be saved");
      }
    });
  }

  function addDraft() {
    if (!page || access !== "edit") {
      return;
    }

    setPage({
      ...page,
      linkItems: [
        ...page.linkItems,
        {
          id: `draft-${crypto.randomUUID()}`,
          title: "",
          destinationUrl: "",
          position: page.linkItems.length,
        },
      ],
    });
  }

  function deleteItem(itemId: string) {
    if (!page || access !== "edit") {
      return;
    }

    const deletedItem = page.linkItems.find((item) => item.id === itemId);
    const deletedIndex = page.linkItems.findIndex((item) => item.id === itemId);

    if (!deletedItem) {
      return;
    }

    setPage({
      ...page,
      linkItems: page.linkItems.filter((item) => item.id !== itemId),
    });

    if (itemId.startsWith("draft-")) {
      return;
    }

    queueSave(async () => {
      const response = await fetch(
        `/api/edit/${encodeURIComponent(token)}/items/${encodeURIComponent(itemId)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        setPage((currentPage) => {
          if (!currentPage || currentPage.linkItems.some((item) => item.id === itemId)) {
            return currentPage;
          }

          const linkItems = [...currentPage.linkItems];
          linkItems.splice(deletedIndex, 0, deletedItem);
          return { ...currentPage, linkItems };
        });
        throw new Error("Link item could not be deleted");
      }
    });
  }

  function moveItem(itemId: string, direction: -1 | 1) {
    if (!page || access !== "edit") {
      return;
    }

    const index = page.linkItems.findIndex((item) => item.id === itemId);
    const targetIndex = index + direction;

    if (index < 0 || targetIndex < 0 || targetIndex >= page.linkItems.length) {
      return;
    }

    const linkItems = [...page.linkItems];
    [linkItems[index], linkItems[targetIndex]] = [linkItems[targetIndex], linkItems[index]];
    setPage({ ...page, linkItems });

    if (linkItems.some((item) => item.id.startsWith("draft-"))) {
      return;
    }

    queueSave(async () => {
      const response = await fetch(
        `/api/edit/${encodeURIComponent(token)}/items/reorder`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemIds: linkItems.map((item) => item.id) }),
        },
      );

      if (!response.ok) {
        throw new Error("Link item order could not be saved");
      }
    });
  }

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

          {page && access === "edit" && (
            <section className="editor-panel" aria-label="Edit Page">
              <div className="editor-panel-heading">
                <div>
                  <h2 className="editor-panel-title">Link items</h2>
                  <p className="editor-panel-description">
                    Changes save automatically as you edit.
                  </p>
                </div>
                <div className="save-status" role="status">
                  {saveState === "saving" && "Saving…"}
                  {saveState === "saved" && "Saved"}
                  {saveState === "error" && "Save failed"}
                </div>
              </div>

              {saveState === "error" && (
                <div className="error-panel" role="alert">
                  Your changes are still on this device. Check your connection and
                  <button className="inline-button" onClick={() => {
                    if (failedSave.current) {
                      void executeSave(failedSave.current);
                    }
                  }} type="button">
                    retry the save
                  </button>
                  .
                </div>
              )}

              {page.linkItems.length === 0 && (
                <p className="editor-empty-message">Add your first Link item below.</p>
              )}

              <div className="editor-item-list">
                {page.linkItems.map((item, index) => (
                  <article className="editor-item" key={item.id}>
                    <div className="editor-item-heading">
                      <span className="editor-item-number">{index + 1}</span>
                      <div className="editor-item-actions">
                        <button aria-label={`Move item ${index + 1} up`} disabled={index === 0} onClick={() => moveItem(item.id, -1)} type="button">↑</button>
                        <button aria-label={`Move item ${index + 1} down`} disabled={index === page.linkItems.length - 1} onClick={() => moveItem(item.id, 1)} type="button">↓</button>
                        <button aria-label={`Delete item ${index + 1}`} onClick={() => deleteItem(item.id)} type="button">Delete</button>
                      </div>
                    </div>
                    <label className="editor-field">
                      <span>Title</span>
                      <input onChange={(event) => updateItem(item.id, "title", event.target.value)} value={item.title} />
                    </label>
                    <label className="editor-field">
                      <span>Destination URL</span>
                      <input onChange={(event) => updateItem(item.id, "destinationUrl", event.target.value)} placeholder="https://example.com" type="url" value={item.destinationUrl} />
                    </label>
                  </article>
                ))}
              </div>

              <button className="secondary-button" onClick={addDraft} type="button">
                Add Link item
              </button>
            </section>
          )}

          {page && access === "read" && page.linkItems.length === 0 && (
            <div className="empty-panel">
              <h2 className="empty-panel-title">
                Nothing here yet
              </h2>
              <p className="empty-panel-description">
                The Editor has not added any Link items yet. Check back later.
              </p>
            </div>
          )}

          {page && access === "read" && page.linkItems.length > 0 && (
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
