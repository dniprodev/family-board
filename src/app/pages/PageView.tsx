import { useEffect, useRef, useState } from "react";
import { LinkRow } from "../components/LinkRow";
import { SiteHeader } from "../components/SiteHeader";
import type { PageResponse } from "../types";

type PageViewProps = {
  access: "read" | "edit";
  token: string;
};

type SaveState = "saved" | "saving" | "error";
type RotationState = "idle" | "rotating" | "error";

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
  const [activeToken, setActiveToken] = useState(token);
  const [failed, setFailed] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [rotationState, setRotationState] = useState<RotationState>("idle");
  const [rotatedEditLink, setRotatedEditLink] = useState<string | null>(null);
  const activeTokenRef = useRef(token);
  const pageRef = useRef<PageResponse | null>(null);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingSaves = useRef(new Map<string, SaveEntry>());
  const failedSaves = useRef(new Map<string, SaveEntry>());
  const saveChains = useRef(new Map<string, Promise<void>>());

  pageRef.current = page;
  activeTokenRef.current = activeToken;

  useEffect(() => {
    setActiveToken(token);
  }, [token]);

  function queueSave(key: string, run: () => Promise<void>) {
    const entry = { run };
    pendingSaves.current.set(key, entry);
    failedSaves.current.delete(key);
    setSaveState("saving");

    const currentTimer = saveTimers.current.get(key);

    if (currentTimer) {
      clearTimeout(currentTimer);
    }

    saveTimers.current.set(key, setTimeout(() => {
      saveTimers.current.delete(key);
      void executeSave(key, entry);
    }, 500));
  }

  async function executeSave(key: string, entry: SaveEntry) {
    const previousSave = saveChains.current.get(key) ?? Promise.resolve();
    const currentSave = previousSave.catch(() => undefined).then(() => entry.run());
    saveChains.current.set(key, currentSave);

    try {
      await currentSave;

      if (pendingSaves.current.get(key) !== entry) {
        return;
      }

      pendingSaves.current.delete(key);
      failedSaves.current.delete(key);
      if (pendingSaves.current.size === 0 && failedSaves.current.size === 0) {
        setSaveState("saved");
      }
    } catch {
      if (pendingSaves.current.get(key) !== entry) {
        return;
      }

      failedSaves.current.set(key, entry);
      setSaveState("error");
    } finally {
      if (saveChains.current.get(key) === currentSave) {
        saveChains.current.delete(key);
      }
    }
  }

  function cancelSave(key: string) {
    const timer = saveTimers.current.get(key);

    if (timer) {
      clearTimeout(timer);
      saveTimers.current.delete(key);
    }

    pendingSaves.current.delete(key);
    failedSaves.current.delete(key);

    if (pendingSaves.current.size === 0 && failedSaves.current.size === 0) {
      setSaveState("saved");
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

    fetch(`/api/${access}/${encodeURIComponent(activeToken)}`, {
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
  }, [access, activeToken]);

  useEffect(() => {
    return () => {
      for (const timer of saveTimers.current.values()) {
        clearTimeout(timer);
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
      cancelSave(itemId);
      return;
    }

    const itemPath = () =>
      `/api/edit/${encodeURIComponent(activeTokenRef.current)}/items`;

    if (itemId.startsWith("draft-")) {
      queueSave(itemId, async () => {
        const currentItem = pageRef.current?.linkItems.find(
          (candidate) => candidate.id === itemId,
        );

        if (!currentItem) {
          return;
        }

        if (!currentItem.id.startsWith("draft-")) {
          const response = await fetch(
            `${itemPath()}/${encodeURIComponent(currentItem.id)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                title: currentItem.title,
                destinationUrl: currentItem.destinationUrl,
              }),
            },
          );

          if (!response.ok) {
            throw new Error("Link item could not be saved");
          }

          return;
        }

        const submitted = {
          title: currentItem.title,
          destinationUrl: currentItem.destinationUrl,
        };
        const response = await fetch(itemPath(), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(submitted),
        });

        if (!response.ok) {
          throw new Error("Link item could not be saved");
        }

        const result = (await response.json()) as { linkItem: PageResponse["linkItems"][number] };
        const latestItem = pageRef.current?.linkItems.find(
          (candidate) => candidate.id === itemId,
        );

        if (!latestItem) {
          await fetch(`${itemPath()}/${encodeURIComponent(result.linkItem.id)}`, {
            method: "DELETE",
          });
          return;
        }

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

        if (
          latestItem.title !== submitted.title ||
          latestItem.destinationUrl !== submitted.destinationUrl
        ) {
          const followUp = await fetch(
            `${itemPath()}/${encodeURIComponent(result.linkItem.id)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                title: latestItem.title,
                destinationUrl: latestItem.destinationUrl,
              }),
            },
          );

          if (!followUp.ok) {
            throw new Error("Link item could not be saved");
          }
        }

        const currentOrder = pageRef.current?.linkItems.map((candidate) =>
          candidate.id === itemId ? result.linkItem.id : candidate.id,
        );

        if (currentOrder && !currentOrder.some((id) => id.startsWith("draft-"))) {
          const orderResponse = await fetch(
            `${itemPath()}/reorder`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ itemIds: currentOrder }),
            },
          );

          if (!orderResponse.ok) {
            throw new Error("Link item order could not be saved");
          }
        }
      });
      return;
    }

    queueSave(itemId, async () => {
      const currentItem = pageRef.current?.linkItems.find(
        (candidate) => candidate.id === itemId,
      );

      if (!currentItem) {
        return;
      }

      const response = await fetch(`${itemPath()}/${encodeURIComponent(currentItem.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: currentItem.title,
          destinationUrl: currentItem.destinationUrl,
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

    const restoreDeletedItem = () => {
      setPage((currentPage) => {
        if (!currentPage || currentPage.linkItems.some((item) => item.id === itemId)) {
          return currentPage;
        }

        const linkItems = [...currentPage.linkItems];
        linkItems.splice(deletedIndex, 0, deletedItem);
        return { ...currentPage, linkItems };
      });
    };

    queueSave(itemId, async () => {
      let response: Response;

      try {
        response = await fetch(
          `/api/edit/${encodeURIComponent(activeTokenRef.current)}/items/${encodeURIComponent(itemId)}`,
          { method: "DELETE" },
        );
      } catch (error) {
        restoreDeletedItem();
        throw error;
      }

      if (!response.ok) {
        restoreDeletedItem();
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

    queueSave("reorder", async () => {
      const currentOrder = pageRef.current?.linkItems.map((item) => item.id);

      if (
        !currentOrder ||
        currentOrder.some((id) => id.startsWith("draft-"))
      ) {
        return;
      }

      const response = await fetch(
        `/api/edit/${encodeURIComponent(activeTokenRef.current)}/items/reorder`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemIds: currentOrder }),
        },
      );

      if (!response.ok) {
        throw new Error("Link item order could not be saved");
      }
    });
  }

  async function rotateEditLink() {
    setRotationState("rotating");

    try {
      const response = await fetch(
        `/api/edit/${encodeURIComponent(activeTokenRef.current)}/rotate`,
        { method: "POST" },
      );

      if (!response.ok) {
        throw new Error("Edit link could not be rotated");
      }

      const result = (await response.json()) as { editLink?: unknown };

      if (typeof result.editLink !== "string") {
        throw new Error("Edit link could not be rotated");
      }

      const newEditUrl = new URL(result.editLink);
      const newToken = newEditUrl.pathname.match(
        /^\/edit\/([A-Za-z0-9_-]{43})$/,
      )?.[1];

      if (!newToken) {
        throw new Error("Edit link could not be rotated");
      }

      window.history.replaceState(null, "", newEditUrl.pathname);
      activeTokenRef.current = newToken;
      setActiveToken(newToken);
      setRotatedEditLink(result.editLink);
      setRotationState("idle");
    } catch {
      setRotationState("error");
    }
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
                    for (const [key, entry] of failedSaves.current) {
                      void executeSave(key, entry);
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

              <section className="editor-access-panel" aria-label="Edit link access">
                <div>
                  <h2 className="editor-panel-title">Edit link access</h2>
                  <p className="editor-panel-description">
                    Rotate the Edit link if you no longer want the current link to
                    grant access.
                  </p>
                </div>
                <button
                  className="secondary-button"
                  disabled={rotationState === "rotating"}
                  onClick={() => void rotateEditLink()}
                  type="button"
                >
                  {rotationState === "rotating" ? "Rotating…" : "Rotate Edit link"}
                </button>
                {rotationState === "error" && (
                  <div className="error-panel" role="alert">
                    The Edit link could not be rotated. Check your connection and
                    try again.
                  </div>
                )}
                {rotatedEditLink && (
                  <div className="editor-access-result">
                    <p className="editor-panel-description">
                      Save this new Edit link. The previous link no longer works.
                    </p>
                    <LinkRow label="New Edit link" link={rotatedEditLink} />
                  </div>
                )}
              </section>
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
