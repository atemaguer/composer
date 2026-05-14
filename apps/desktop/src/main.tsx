import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { TooltipProvider } from "./components/ui/tooltip";
import { AppearanceProvider } from "./theme/AppearanceProvider";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppearanceProvider>
      <TooltipProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </TooltipProvider>
    </AppearanceProvider>
  </React.StrictMode>
);
