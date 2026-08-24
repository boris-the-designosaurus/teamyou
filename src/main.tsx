import React from "react";
import ReactDOM from "react-dom/client";
import { ClickToComponent } from "click-to-react-component";
import { App } from "./App";
import "./tokens.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    {/* Dev only: ⌥/Alt-click any element in the app to open its JSX in Cursor. */}
    {import.meta.env.DEV && <ClickToComponent editor="cursor" />}
  </React.StrictMode>,
);
