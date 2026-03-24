import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Fix: Radix UI sets pointer-events:none on body for overlays.
// window.confirm() blocks JS, preventing Radix cleanup, leaving body stuck.
// Solution 1: Patch window.confirm to restore pointer-events after dialog
const _nativeConfirm = window.confirm.bind(window);
window.confirm = function (msg) {
  const result = _nativeConfirm(msg);
  document.body.style.pointerEvents = "";
  document.body.style.removeProperty("pointer-events");
  // Also clean up after next frames in case Radix re-applies
  requestAnimationFrame(() => {
    if (!document.querySelector("[data-radix-dialog-overlay], [data-radix-alert-dialog-overlay], [data-radix-select-content], [data-radix-popover-content]")) {
      document.body.style.removeProperty("pointer-events");
    }
  });
  return result;
};

// Solution 2: MutationObserver - detect stuck pointer-events:none on body
// If no Radix overlay is actually open, remove the stuck pointer-events
const _peObserver = new MutationObserver(() => {
  if (document.body.style.pointerEvents === "none") {
    setTimeout(() => {
      const hasOverlay = document.querySelector(
        "[data-radix-dialog-overlay], [data-radix-alert-dialog-overlay], [data-radix-select-content], [data-radix-popover-content], [data-radix-dropdown-menu-content]"
      );
      if (!hasOverlay && document.body.style.pointerEvents === "none") {
        document.body.style.removeProperty("pointer-events");
      }
    }, 300);
  }
});
_peObserver.observe(document.body, { attributeFilter: ["style"], attributes: true });

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
