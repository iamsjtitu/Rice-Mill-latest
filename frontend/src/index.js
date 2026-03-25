import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Fix: Radix UI sets pointer-events:none on body for overlays.
// window.confirm() blocks JS, preventing Radix cleanup, leaving body stuck.
// Solution 1: Patch window.confirm to aggressively restore pointer-events after native dialog
const _nativeConfirm = window.confirm.bind(window);
window.confirm = function (msg) {
  const result = _nativeConfirm(msg);
  // Immediate cleanup
  document.body.style.pointerEvents = "";
  document.body.style.removeProperty("pointer-events");
  // Aggressive multi-frame cleanup - Radix may re-apply across multiple frames
  const cleanup = () => {
    const hasOverlay = document.querySelector("[data-radix-dialog-overlay], [data-radix-alert-dialog-overlay], [data-radix-select-content], [data-radix-popover-content]");
    if (!hasOverlay) {
      document.body.style.pointerEvents = "";
      document.body.style.removeProperty("pointer-events");
    }
  };
  requestAnimationFrame(cleanup);
  requestAnimationFrame(() => requestAnimationFrame(cleanup));
  setTimeout(cleanup, 50);
  setTimeout(cleanup, 150);
  setTimeout(cleanup, 300);
  setTimeout(cleanup, 500);
  setTimeout(cleanup, 1000);
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
    }, 100);
  }
});
_peObserver.observe(document.body, { attributeFilter: ["style"], attributes: true });

// Solution 3: Periodic safety net - every 1.5s check for stuck pointer-events
setInterval(() => {
  if (document.body.style.pointerEvents === "none") {
    const hasOverlay = document.querySelector(
      "[data-radix-dialog-overlay], [data-radix-alert-dialog-overlay], [data-radix-select-content], [data-radix-popover-content], [data-radix-dropdown-menu-content]"
    );
    if (!hasOverlay) {
      document.body.style.removeProperty("pointer-events");
    }
  }
}, 1500);

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
