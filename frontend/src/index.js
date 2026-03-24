import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Fix: Radix UI sets pointer-events:none on body for overlays.
// window.confirm() blocks JS, preventing Radix cleanup.
// This patch restores pointer-events after every native confirm.
const _nativeConfirm = window.confirm.bind(window);
window.confirm = function (msg) {
  const result = _nativeConfirm(msg);
  document.body.style.pointerEvents = "";
  document.body.style.removeProperty("pointer-events");
  return result;
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
