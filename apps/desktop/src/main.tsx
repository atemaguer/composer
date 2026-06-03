import React from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { AppToaster } from "./components/AppToaster";
import { TooltipProvider } from "./components/ui/tooltip";
import { ComposerPostHogProvider } from "./lib/posthog";
import { WindowFrameProvider } from "./components/WindowFrameProvider";
import { AppearanceProvider } from "./theme/AppearanceProvider";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ComposerPostHogProvider>
      <AppearanceProvider>
        <WindowFrameProvider>
          <TooltipProvider>
            <RouterProvider router={router} />
            <AppToaster />
          </TooltipProvider>
        </WindowFrameProvider>
      </AppearanceProvider>
    </ComposerPostHogProvider>
  </React.StrictMode>
);
