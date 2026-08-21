import { getRoute } from "./app/routing";
import { CreatePage } from "./app/pages/CreatePage";
import { NotFoundPage } from "./app/pages/NotFoundPage";
import { PageView } from "./app/pages/PageView";

export default function App() {
  const route = getRoute();

  if (route.kind === "home") {
    return <CreatePage />;
  }

  if (route.kind === "page") {
    return <PageView access={route.access} token={route.token} />;
  }

  return <NotFoundPage />;
}
