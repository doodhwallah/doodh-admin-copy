import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/common/ErrorBoundary.tsx";
import "./index.css";

// Detect Capacitor native app environment and add class for targeted styling
// Uses official Capacitor API - does NOT trigger in browsers or in-app WebViews
(function detectCapacitor() {
  const capacitor = (window as any).Capacitor;
  const isCapacitorNative = capacitor && typeof capacitor.isNativePlatform === 'function' 
    ? capacitor.isNativePlatform() 
    : !!(capacitor?.isNative);
  
  if (isCapacitorNative) {
    document.documentElement.classList.add('capacitor-native');
    document.body.classList.add('capacitor-native');
  }
})();

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
