import { useState } from "react";
import { Button } from "../ui/button";
import { MessageCircle } from "lucide-react";
import { SendToGroupDialog } from "../SendToGroupDialog";

/**
 * Reusable icon button: opens WhatsApp Group dialog with a pre-built file Blob.
 *
 * Usage:
 *   <ShareFileViaWhatsApp
 *     getFile={async () => ({ blob: myXlsxBlob, name: "stock_register.xlsx" })}
 *     caption="Stock Register Report"
 *   />
 *
 * Renders an icon-only green button (with tooltip via title attribute).
 * The `getFile` callback is invoked when the user clicks the button.
 * It must return `{ blob: Blob, name: string }`. The blob is sent as-is
 * via /api/whatsapp/send-file (MIME auto-detected from filename).
 */
export function ShareFileViaWhatsApp({ getFile, caption = "", className = "", testId = "share-file-whatsapp", title = "WhatsApp pe bhejein" }) {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState({ blob: null, name: "" });
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const result = await getFile();
      if (!result || !result.blob) {
        setLoading(false);
        return;
      }
      setPayload({ blob: result.blob, name: result.name || "attachment.bin" });
      setOpen(true);
    } catch (e) {
      console.error("File preparation error:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={loading}
        size="sm"
        variant="outline"
        title={title}
        aria-label={title}
        className={`bg-green-600 hover:bg-green-700 border-green-500 text-white h-9 w-9 p-0 ${className}`}
        data-testid={testId}
      >
        <MessageCircle className={`w-4 h-4 ${loading ? "animate-pulse" : ""}`} />
      </Button>
      <SendToGroupDialog
        open={open}
        onOpenChange={setOpen}
        text={caption}
        fileBlob={payload.blob}
        fileName={payload.name}
      />
    </>
  );
}
