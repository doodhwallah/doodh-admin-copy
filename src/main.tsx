import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/common/ErrorBoundary.tsx";
import "./index.css";

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
