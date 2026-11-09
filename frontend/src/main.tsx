import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { MathJaxContext } from "better-react-mathjax";
import { router } from "./router";
import { useAuthStore } from "./stores/authStore";
import { usePlatformStore } from "./stores/platformStore";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

const mathJaxConfig = {
  loader: { load: ["input/tex", "output/chtml"] },
  tex: {
    inlineMath: [
      ["\\(", "\\)"],
      ["$", "$"],
    ],
    displayMath: [
      ["\\[", "\\]"],
      ["$$", "$$"],
    ],
  },
};

function Bootstrap({ children }: { children: React.ReactNode }) {
  const bootstrapAuth = useAuthStore((s) => s.bootstrap);
  const initialized = useAuthStore((s) => s.initialized);
  const bootstrapPlatform = usePlatformStore((s) => s.bootstrap);
  const platformLoaded = usePlatformStore((s) => s.loaded);
  const appName = usePlatformStore((s) => s.appName);

  React.useEffect(() => {
    void bootstrapAuth();
    void bootstrapPlatform();
  }, [bootstrapAuth, bootstrapPlatform]);

  React.useEffect(() => {
    if (platformLoaded) document.title = appName();
  }, [platformLoaded, appName]);

  /* ── No blocking splash ────────────────────────────────────────────────
     The whole app used to sit behind a full-screen "Loading workspace…" until
     /auth/session and /platform/config answered. On a free-tier API waking up
     that is 20-30 s of nothing, and visitors leave. The shell now paints on the
     first frame and those two calls fill it in. Only a returning signed-in user
     whose cache is empty waits — and even that is capped at 2.5 s. */
  const [giveUpWaiting, setGiveUpWaiting] = React.useState(false);
  React.useEffect(() => {
    if (initialized) return;
    const timer = setTimeout(() => setGiveUpWaiting(true), 2500);
    return () => clearTimeout(timer);
  }, [initialized]);

  const stillWarming = !initialized && !giveUpWaiting;

  return (
    <>
      {stillWarming && (
        <div className="fixed inset-x-0 top-0 z-[200] h-0.5 overflow-hidden bg-primary/15">
          <div className="h-full w-1/3 animate-[cz-boot_1.1s_ease-in-out_infinite] bg-primary" />
        </div>
      )}
      {children}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MathJaxContext config={mathJaxConfig} version={3}>
      <QueryClientProvider client={queryClient}>
        <Bootstrap>
          <RouterProvider router={router} />
        </Bootstrap>
      </QueryClientProvider>
    </MathJaxContext>
  </React.StrictMode>
);
