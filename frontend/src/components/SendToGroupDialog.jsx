import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Users, RefreshCw } from "lucide-react";

const _isElectron = typeof window !== "undefined" && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? "" : (process.env.REACT_APP_BACKEND_URL || "");
const API = `${BACKEND_URL}/api`;

export function SendToGroupDialog({ open, onOpenChange, text, pdfUrl, onSent }) {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedGroup("");
      fetchGroups();
    }
  }, [open]);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/whatsapp/groups`);
      if (res.data.success) {
        setGroups(res.data.groups || []);
      } else {
        toast.error(res.data.error || "Groups fetch fail");
      }
    } catch (e) {
      toast.error("Groups load error: " + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!selectedGroup) { toast.error("Pehle group select karein"); return; }
    setSending(true);
    try {
      const res = await axios.post(`${API}/whatsapp/send-group`, {
        group_id: selectedGroup,
        text: text || "",
        pdf_url: pdfUrl || ""
      });
      if (res.data.success) {
        toast.success(res.data.message || "Group mein bhej diya!");
        onOpenChange(false);
        onSent?.();
      } else {
        toast.error(res.data.error || "Group send fail");
      }
    } catch (e) {
      toast.error("Group send error: " + (e.response?.data?.detail || e.response?.data?.error || e.message));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-md" data-testid="send-to-group-dialog">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-green-400" /> WhatsApp Group mein bhejein
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger className="bg-slate-700 border-slate-600 text-white" data-testid="group-select">
                <SelectValue placeholder={loading ? "Loading groups..." : "Group select karein"} />
              </SelectTrigger>
              <SelectContent className="bg-slate-700 border-slate-600">
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id} className="text-white">{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={fetchGroups} disabled={loading} className="text-slate-400 shrink-0" data-testid="group-refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {groups.length === 0 && !loading && (
            <p className="text-xs text-slate-400">Koi group nahi mila. WhatsApp mein group banana zaruri hai.</p>
          )}
          <Button onClick={handleSend} disabled={!selectedGroup || sending} className="w-full bg-green-600 hover:bg-green-700 text-white" data-testid="group-send-btn">
            <Send className="w-4 h-4 mr-2" />
            {sending ? "Bhej rahe hain..." : "Group mein bhejein"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
