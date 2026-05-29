import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
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
            <HashRouter>
              <App />
            </HashRouter>
            <AppToaster />
          </TooltipProvider>
        </WindowFrameProvider>
      </AppearanceProvider>
    </ComposerPostHogProvider>
  </React.StrictMode>
);
