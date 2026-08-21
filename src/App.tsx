import { useEffect, useState } from "react";
import { getSavedLaunchPage } from "./app/launch-page";
import { getRoute } from "./app/routing";
import { CreatePage } from "./app/pages/CreatePage";
import { NotFoundPage } from "./app/pages/NotFoundPage";
import { PageView } from "./app/pages/PageView";

function HomeRoute() {
  const [savedLaunchPage] = useState(() => getSavedLaunchPage());

  useEffect(() => {
    if (savedLaunchPage) {
      window.location.replace(savedLaunchPage);
    }
  }, [savedLaunchPage]);

  if (savedLaunchPage) {
    return (
      <main className="site-page site-page-launching">
        <div className="site-container">
          <p className="loading-message">Opening your saved Page…</p>
        </div>
      </main>
    );
  }

  return <CreatePage />;
}

export default function App() {
  const route = getRoute();

  if (route.kind === "home") {
    return <HomeRoute />;
  }

  if (route.kind === "page") {
    return <PageView access={route.access} token={route.token} />;
  }

  return <NotFoundPage />;
}
