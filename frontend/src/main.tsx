import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { ClaimPage } from "./components/ClaimPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeProvider } from "./lib/themeMode";
import { appBase } from "./lib/urls";
import "./index.css";

function claimToken(): string | null {
  const prefix = `${appBase()}/claim/`;
  const path = window.location.pathname;
  if (path.startsWith(prefix)) {
    const token = path.slice(prefix.length).split("/")[0];
    return token ? decodeURIComponent(token) : null;
  }
  const m = path.match(/\/claim\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const token = claimToken();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        {token ? <ClaimPage token={token} /> : <App />}
      </ErrorBoundary>
    </ThemeProvider>
  </React.StrictMode>,
);
