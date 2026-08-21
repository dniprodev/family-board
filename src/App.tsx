import { useEffect, useState } from "react";

type PageLinks = {
  readLink: string;
  editLink: string;
};

type LinkItem = {
  id: string;
  title: string;
  destinationUrl: string;
  position: number;
};

type PageResponse = {
  access: "read" | "edit";
  linkItems: LinkItem[];
};

type Route =
  | { kind: "home" }
  | { kind: "page"; access: "read" | "edit"; token: string }
  | { kind: "not-found" };

function getRoute(): Route {
  const match = window.location.pathname.match(/^\/(read|edit)\/([^/]+)$/);

  if (!match) {
    return window.location.pathname === "/" ? { kind: "home" } : { kind: "not-found" };
  }

  return {
    kind: "page",
    access: match[1] as "read" | "edit",
    token: match[2],
  };
}

function Header() {
  return (
    <header className="flex items-center justify-between gap-4">
      <a
        className="text-sm font-semibold uppercase tracking-[0.2em] text-[#5d6c68]"
        href="/"
      >
        Family Board
      </a>
      <span className="rounded-full bg-[#d8e4dc] px-3 py-1 text-xs font-medium text-[#315247]">
        Account-free
      </span>
    </header>
  );
}

function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access may be unavailable outside a secure browser context.
    }
  }

  return (
    <button
      className="shrink-0 rounded-lg border border-[#b8c5bb] px-3 py-2 text-sm font-semibold text-[#315247] transition hover:bg-[#edf3ed]"
      onClick={copyLink}
      type="button"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function LinkRow({ label, link }: { label: string; link: string }) {
  return (
    <div className="rounded-xl border border-[#d8d1c5] bg-white/60 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-[#315247]">{label}</span>
        <CopyLinkButton link={link} />
      </div>
      <a
        className="block overflow-hidden text-ellipsis whitespace-nowrap text-sm text-[#5d6c68] underline decoration-[#b8c5bb] underline-offset-4"
        href={link}
      >
        {link}
      </a>
    </div>
  );
}

function CreatePage() {
  const [links, setLinks] = useState<PageLinks | null>(null);
  const [status, setStatus] = useState<"idle" | "creating" | "error">("idle");

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
    <main className="min-h-screen bg-[#f4f0e8] px-5 py-8 text-[#24302f] sm:px-8 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col gap-12">
        <Header />

        <section className="max-w-xl">
          <p className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-[#b06142]">
            A shared page of links
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
            Keep the useful things close.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-[#5d6c68]">
            Create a Page and get separate Read and Edit links. No account or
            password is needed.
          </p>
        </section>

        <section className="max-w-xl rounded-2xl border border-[#d8d1c5] bg-[#fbf8f2] p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Start a new Page</h2>
              <p className="mt-1 text-sm leading-6 text-[#5d6c68]">
                Keep both links somewhere safe. Anyone with a link can use its
                access.
              </p>
            </div>
            <button
              className="rounded-xl bg-[#315247] px-5 py-3 font-semibold text-white transition hover:bg-[#243f37] disabled:cursor-wait disabled:opacity-60"
              disabled={status === "creating"}
              onClick={handleCreate}
              type="button"
            >
              {status === "creating" ? "Creating…" : "Create Page"}
            </button>
          </div>

          {status === "error" && (
            <p className="mt-5 rounded-lg bg-[#f8e5dd] px-4 py-3 text-sm text-[#8f432b]" role="alert">
              The Page could not be created. Please try again.
            </p>
          )}

          {links && (
            <div className="mt-6 space-y-3 border-t border-[#d8d1c5] pt-6">
              <p className="text-sm font-semibold text-[#315247]">
                Your Page links
              </p>
              <LinkRow label="Read link" link={links.readLink} />
              <LinkRow label="Edit link" link={links.editLink} />
            </div>
          )}
        </section>

        <footer className="mt-auto border-t border-[#d8d1c5] pt-5 text-sm text-[#75817d]">
          Save your Edit link before leaving this page. It is the only way to
          return as the Editor.
        </footer>
      </div>
    </main>
  );
}

function PageView({ access, token }: { access: "read" | "edit"; token: string }) {
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

    fetch(`/api/${access}/${encodeURIComponent(token)}`, { signal: controller.signal })
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
    <main className="min-h-screen bg-[#f4f0e8] px-5 py-8 text-[#24302f] sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <Header />

        <section className="mt-16">
          <p className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-[#b06142]">
            {access === "read" ? "Read link" : "Edit link"}
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Family Board
          </h1>

          {!page && !failed && (
            <p className="mt-6 text-lg text-[#5d6c68]">Loading Page…</p>
          )}

          {failed && (
            <div className="mt-6 rounded-2xl border border-[#e7c7ba] bg-[#f8e5dd] p-5 text-[#8f432b]" role="alert">
              This link is invalid or the Page is unavailable.
            </div>
          )}

          {page && page.linkItems.length === 0 && (
            <div className="mt-8 rounded-2xl border border-[#d8d1c5] bg-[#fbf8f2] p-6">
              <h2 className="text-xl font-semibold">
                {access === "read" ? "Nothing here yet" : "This Page is empty"}
              </h2>
              <p className="mt-2 leading-7 text-[#5d6c68]">
                {access === "read"
                  ? "The Editor has not added any Link items yet. Check back later."
                  : "The Editor tools will be available here in the next step."}
              </p>
            </div>
          )}

          {page && page.linkItems.length > 0 && (
            <ul className="mt-8 space-y-3">
              {page.linkItems.map((item) => (
                <li key={item.id}>
                  <a
                    className="block rounded-2xl border border-[#d8d1c5] bg-[#fbf8f2] p-5 font-semibold text-[#315247] transition hover:border-[#b8c5bb] hover:bg-white"
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

export default function App() {
  const route = getRoute();

  if (route.kind === "home") {
    return <CreatePage />;
  }

  if (route.kind === "page") {
    return <PageView access={route.access} token={route.token} />;
  }

  return (
    <main className="min-h-screen bg-[#f4f0e8] px-5 py-10 text-[#24302f] sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Header />
        <h1 className="mt-20 text-4xl font-semibold">Page not found</h1>
        <a className="mt-5 inline-block text-[#315247] underline" href="/">
          Create a new Page
        </a>
      </div>
    </main>
  );
}
