import { SiteHeader } from "../components/SiteHeader";

export function NotFoundPage() {
  return (
    <main className="site-page site-page-not-found">
      <div className="site-container">
        <SiteHeader />
        <h1 className="not-found-title">Page not found</h1>
        <a className="not-found-link" href="/">
          Create a new Page
        </a>
      </div>
    </main>
  );
}
