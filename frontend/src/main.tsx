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
    if (platformLoaded) {
      document.title = appName();
    }
  }, [platformLoaded, appName]);

  if (!initialized || !platformLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 animate-in">
          <img
            src="/favicon.svg"
            alt="Cronyzo"
            className="h-16 w-16 rounded-xl bg-white shadow-lg"
          />
          <div className="flex flex-col items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-foreground">
              Cronyzo
            </span>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
              Loading workspace…
            </div>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
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
