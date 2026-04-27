import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import {
  FileText, Download, Sparkles, Languages, Wand2, Settings as SettingsIcon, Save, KeyRound,
  FolderOpen, BookTemplate, MessageCircle, Users, Trash2, Send, Loader2, FileWarning,
  Banknote, AlertCircle, Building2, Truck, AlertTriangle, FileCheck, Receipt, Eraser, Eye,
} from "lucide-react";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

const LANGS = ["English", "Hindi", "Odia"];

// Map template icon names → lucide components
const TEMPLATE_ICONS = {
  Banknote, AlertCircle, FileWarning, Building2, Truck, AlertTriangle, FileCheck, Receipt, FileText,
};

const LetterPadTab = () => {
  const today = new Date().toISOString().slice(0, 10).split('-').reverse().join('-');
  const [refNo, setRefNo] = useState("");
  const [date, setDate] = useState(today);
  const [toAddress, setToAddress] = useState("");
  const [subject, setSubject] = useState("");
  const [references, setReferences] = useState("");
  const [body, setBody] = useState("");
  const [downloading, setDownloading] = useState(false);

  // Active draft tracking — if loaded from a draft, Save updates it; else creates new
  const [activeDraftId, setActiveDraftId] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");

  // Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({
    gstin: "",
    phone: "",
    phone_secondary: "",
    address: "",
    email: "",
    license_number: "",
    signature_name: "",
    signature_designation: "",
    ai_enabled: false,
    has_gemini_key: false,
    has_openai_key: false,
    ai_provider: "gemini",
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [geminiKey, setGeminiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");

  // AI dialog
  const [aiDialog, setAiDialog] = useState({ open: false, mode: "generate" });
  const [aiInput, setAiInput] = useState("");
  const [aiTargetLang, setAiTargetLang] = useState("English");
  const [aiBusy, setAiBusy] = useState(false);

  // Drafts
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [savingDraft, setSavingDraft] = useState(false);

  // Templates
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState([]);

  // WhatsApp
  const [waOpen, setWaOpen] = useState({ open: false, mode: "phone" });
  const [waPhone, setWaPhone] = useState("");
  const [waGroupId, setWaGroupId] = useState("");
  const [waCaption, setWaCaption] = useState("");
  const [waBusy, setWaBusy] = useState(false);

  // Preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/letter-pad/settings`);
      setSettings({
        gstin: res.data?.gstin || "",
        phone: res.data?.phone || "",
        phone_secondary: res.data?.phone_secondary || "",
        address: res.data?.address || "",
        email: res.data?.email || "",
        license_number: res.data?.license_number || "",
        signature_name: res.data?.signature_name || "",
        signature_designation: res.data?.signature_designation || "",
        ai_enabled: !!res.data?.ai_enabled,
        has_gemini_key: !!res.data?.has_gemini_key,
        has_openai_key: !!res.data?.has_openai_key,
        ai_provider: res.data?.ai_provider || "gemini",
      });
    } catch (e) { /* ignore */ }
  }, []);

  const loadDrafts = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/letter-pad/drafts`);
      setDrafts(res.data || []);
    } catch (e) { /* ignore */ }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/letter-pad/templates`);
      setTemplates(res.data || []);
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => { loadSettings(); loadTemplates(); }, [loadSettings, loadTemplates]);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const payload = {
        gstin: settings.gstin || "",
        phone: settings.phone || "",
        phone_secondary: settings.phone_secondary || "",
        address: settings.address || "",
        email: settings.email || "",
        license_number: settings.license_number || "",
        signature_name: settings.signature_name || "",
        signature_designation: settings.signature_designation || "",
        ai_enabled: settings.ai_enabled,
        ai_provider: settings.ai_provider,
      };
      if (geminiKey) payload.gemini_key = geminiKey;
      if (openaiKey) payload.openai_key = openaiKey;
      const res = await axios.put(`${API}/letter-pad/settings`, payload);
      setSettings({
        gstin: res.data?.gstin || "",
        phone: res.data?.phone || "",
        phone_secondary: res.data?.phone_secondary || "",
        address: res.data?.address || "",
        email: res.data?.email || "",
        license_number: res.data?.license_number || "",
        signature_name: res.data?.signature_name || "",
        signature_designation: res.data?.signature_designation || "",
        ai_enabled: !!res.data?.ai_enabled,
        has_gemini_key: !!res.data?.has_gemini_key,
        has_openai_key: !!res.data?.has_openai_key,
        ai_provider: res.data?.ai_provider || "gemini",
      });
      setGeminiKey("");
      setOpenaiKey("");
      toast.success("Letterhead settings save ho gayi");
      setSettingsOpen(false);
    } catch (e) {
      const detail = e.response?.data?.detail || e.message || 'Unknown error';
      console.error('Settings save error:', e);
      toast.error(`Settings save nahi ho payi: ${detail}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const downloadFile = async (format) => {
    if (!body.trim()) { toast.error("Letter body khali hai"); return; }
    setDownloading(true);
    try {
      const res = await axios.post(
        `${API}/letter-pad/${format}`,
        { ref_no: refNo, date, to_address: toAddress, subject, references, body },
        { responseType: "blob" }
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      const ext = format === "pdf" ? "pdf" : "docx";
      a.download = `letter_${date.replace(/-/g, '')}.${ext}`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} download ho gayi`);
    } catch (e) {
      toast.error("Download fail ho gaya");
    } finally {
      setDownloading(false);
    }
  };

  const aiAvailable = settings.ai_enabled && (settings.has_gemini_key || settings.has_openai_key);

  const openAi = (mode) => {
    if (!aiAvailable) {
      toast.error("AI assistant disabled — Settings se enable kar ke API key dale");
      setSettingsOpen(true);
      return;
    }
    if (mode === "improve" && !body.trim()) { toast.error("Pehle body type karein, fir improve kare"); return; }
    if (mode === "translate" && !body.trim()) { toast.error("Pehle body type karein, fir translate kare"); return; }
    setAiDialog({ open: true, mode });
    setAiInput(mode === "generate" ? "" : body);
  };

  const runAi = async () => {
    if (!aiInput.trim()) { toast.error("Input khali hai"); return; }
    setAiBusy(true);
    try {
      const payload = { mode: aiDialog.mode, text: aiInput };
      if (aiDialog.mode === "translate") payload.target_lang = aiTargetLang;
      const res = await axios.post(`${API}/letter-pad/ai`, payload);
      setBody(res.data.result);
      // For 'generate' mode: AI also returns subject + to_address — auto-fill them
      if (aiDialog.mode === 'generate' && res.data.structured) {
        if (res.data.subject) setSubject(res.data.subject);
        if (res.data.to_address) setToAddress(res.data.to_address);
      }
      toast.success(`AI ne ${aiDialog.mode === 'generate' ? 'letter likha (Subject + To bhi auto-fill kiya)' : aiDialog.mode === 'improve' ? 'letter sudhara' : 'translate kiya'} (${res.data.provider})`);
      setAiDialog({ open: false, mode: "generate" });
    } catch (e) {
      toast.error(e.response?.data?.detail || "AI fail ho gaya");
    } finally {
      setAiBusy(false);
    }
  };

  const openPreview = async () => {
    if (!body.trim()) { toast.error("Pehle body type karein"); return; }
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const res = await axios.post(
        `${API}/letter-pad/pdf`,
        { ref_no: refNo, date, to_address: toAddress, subject, references, body },
        { responseType: "blob" }
      );
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      // Cleanup old URL if any
      if (previewUrl) window.URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch (e) {
      toast.error("Preview generate fail");
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewOpen(false);
    if (previewUrl) {
      window.URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
    }
  };

  // ====================== DRAFTS ======================
  const newLetter = () => {
    setActiveDraftId(null);
    setDraftTitle("");
    setRefNo("");
    setDate(today);
    setToAddress("");
    setSubject("");
    setReferences("");
    setBody("");
  };

  const clearAll = () => {
    const hasContent = (body.trim() || subject.trim() || toAddress.trim() || references.trim() || refNo.trim());
    if (hasContent && !window.confirm("Saara letter clear karna hai? Ye undo nahi hoga.")) return;
    newLetter();
    toast.success("Letter clear ho gaya");
  };

  const saveDraft = async () => {
    if (!body.trim() && !subject.trim()) {
      toast.error("Khaali draft save nahi ho sakti — kuch text type karein");
      return;
    }
    setSavingDraft(true);
    try {
      const payload = {
        title: draftTitle || subject || "Untitled Draft",
        ref_no: refNo, date, to_address: toAddress, subject, references, body,
      };
      let res;
      if (activeDraftId) {
        res = await axios.put(`${API}/letter-pad/drafts/${activeDraftId}`, payload);
        toast.success("Draft update ho gaya");
      } else {
        res = await axios.post(`${API}/letter-pad/drafts`, payload);
        setActiveDraftId(res.data.id);
        toast.success("Draft save ho gaya");
      }
      setDraftTitle(res.data.title);
      loadDrafts();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Draft save fail");
    } finally {
      setSavingDraft(false);
    }
  };

  const loadDraft = (d) => {
    setActiveDraftId(d.id);
    setDraftTitle(d.title || "");
    setRefNo(d.ref_no || "");
    setDate(d.date || today);
    setToAddress(d.to_address || "");
    setSubject(d.subject || "");
    setReferences(d.references || "");
    setBody(d.body || "");
    setDraftsOpen(false);
    toast.success(`Draft "${d.title}" load ho gaya`);
  };

  const deleteDraft = async (d, e) => {
    e?.stopPropagation();
    if (!window.confirm(`Draft "${d.title}" delete karna hai?`)) return;
    try {
      await axios.delete(`${API}/letter-pad/drafts/${d.id}`);
      toast.success("Draft delete ho gaya");
      if (activeDraftId === d.id) {
        setActiveDraftId(null);
        setDraftTitle("");
      }
      loadDrafts();
    } catch (e) {
      toast.error("Delete fail");
    }
  };

  // ====================== TEMPLATES ======================
  const applyTemplate = async (t) => {
    try {
      const res = await axios.get(`${API}/letter-pad/templates/${t.id}`);
      const tmpl = res.data;
      setActiveDraftId(null);
      setDraftTitle("");
      setToAddress(tmpl.to_address || "");
      setSubject(tmpl.subject || "");
      setReferences(tmpl.references || "");
      setBody(tmpl.body || "");
      setTemplatesOpen(false);
      toast.success(`Template "${t.name}" apply ho gaya`);
    } catch (e) {
      toast.error("Template load fail");
    }
  };

  // ====================== WHATSAPP ======================
  const openWhatsApp = (mode) => {
    if (!body.trim()) { toast.error("Pehle body type karein, fir share karein"); return; }
    setWaPhone("");
    setWaGroupId("");
    setWaCaption("");
    setWaOpen({ open: true, mode });
  };

  const sendWhatsApp = async () => {
    setWaBusy(true);
    try {
      const payload = {
        letter: { ref_no: refNo, date, to_address: toAddress, subject, references, body },
        mode: waOpen.mode,
        phone: waPhone,
        group_id: waGroupId,
        caption: waCaption,
      };
      const res = await axios.post(`${API}/letter-pad/whatsapp`, payload);
      if (res.data.success) {
        toast.success(res.data.message || "WhatsApp pe bhej diya!");
        setWaOpen({ open: false, mode: "phone" });
      } else {
        toast.error(res.data.error || res.data.message || "Send fail");
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "WhatsApp send fail");
    } finally {
      setWaBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="letter-pad-tab">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-amber-400 text-xl font-bold">Company Letter Pad</h2>
          <p className="text-slate-400 text-xs">
            Professional letterhead — PDF / Word / WhatsApp.{' '}
            {aiAvailable
              ? <span className="text-emerald-400">AI Assistant active</span>
              : <span className="text-slate-500">AI off</span>}
            {activeDraftId && draftTitle && (
              <span className="ml-2 text-amber-400">· Editing: {draftTitle}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={newLetter} variant="outline" size="sm"
            className="border-slate-600 text-slate-300" data-testid="letter-new-btn">
            <FileText className="w-4 h-4 mr-1" /> New
          </Button>
          <Button onClick={clearAll} variant="outline" size="sm"
            className="border-rose-700 text-rose-400 hover:bg-rose-900/30" data-testid="letter-clear-all-btn">
            <Eraser className="w-4 h-4 mr-1" /> Clear All
          </Button>
          <Button onClick={() => { loadDrafts(); setDraftsOpen(true); }} variant="outline" size="sm"
            className="border-amber-700 text-amber-400 hover:bg-amber-900/30" data-testid="letter-drafts-btn">
            <FolderOpen className="w-4 h-4 mr-1" /> Drafts
          </Button>
          <Button onClick={() => setTemplatesOpen(true)} variant="outline" size="sm"
            className="border-emerald-700 text-emerald-400 hover:bg-emerald-900/30" data-testid="letter-templates-btn">
            <BookTemplate className="w-4 h-4 mr-1" /> Templates
          </Button>
          <Button onClick={() => setSettingsOpen(true)} variant="outline" size="sm" className="border-slate-600 text-slate-300" data-testid="letter-pad-settings-btn">
            <SettingsIcon className="w-4 h-4 mr-1" /> Settings
          </Button>
        </div>
      </div>

      {/* Form Card */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <FileText className="w-4 h-4" /> Letter Compose
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-400 text-xs">Ref. No.</Label>
              <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="(Optional)" className="bg-slate-700 border-slate-600 text-white" data-testid="letter-ref-no" />
            </div>
            <div>
              <Label className="text-slate-400 text-xs">Date</Label>
              <Input value={date} onChange={(e) => setDate(e.target.value)} placeholder="DD-MM-YYYY" className="bg-slate-700 border-slate-600 text-white" data-testid="letter-date" />
            </div>
          </div>

          <div>
            <Label className="text-slate-400 text-xs">To (Recipient Address — multi-line)</Label>
            <Textarea value={toAddress} onChange={(e) => setToAddress(e.target.value)} rows={3}
              placeholder="The Branch Manager,&#10;State Bank of India,&#10;Kesinga, Odisha" className="bg-slate-700 border-slate-600 text-white" data-testid="letter-to-address" />
          </div>

          <div>
            <Label className="text-slate-400 text-xs">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Request for Account Statement" className="bg-slate-700 border-slate-600 text-white" data-testid="letter-subject" />
          </div>

          <div>
            <Label className="text-slate-400 text-xs">Reference (Optional)</Label>
            <Textarea value={references} onChange={(e) => setReferences(e.target.value)} rows={2}
              placeholder="1. Your letter dated 10-04-2026&#10;2. Account No. 123456789" className="bg-slate-700 border-slate-600 text-white" data-testid="letter-references" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-slate-400 text-xs">Letter Body</Label>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => openAi("generate")}
                  className="h-7 px-2 text-emerald-400 hover:bg-emerald-900/30 text-xs"
                  data-testid="ai-generate-btn">
                  <Sparkles className="w-3 h-3 mr-1" /> AI Generate
                </Button>
                <Button size="sm" variant="ghost" onClick={() => openAi("improve")}
                  className="h-7 px-2 text-blue-400 hover:bg-blue-900/30 text-xs"
                  data-testid="ai-improve-btn">
                  <Wand2 className="w-3 h-3 mr-1" /> Improve
                </Button>
                <Button size="sm" variant="ghost" onClick={() => openAi("translate")}
                  className="h-7 px-2 text-purple-400 hover:bg-purple-900/30 text-xs"
                  data-testid="ai-translate-btn">
                  <Languages className="w-3 h-3 mr-1" /> Translate
                </Button>
              </div>
            </div>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12}
              placeholder="Respected Sir,&#10;&#10;I hereby request you to..." className="bg-slate-700 border-slate-600 text-white font-mono" data-testid="letter-body" />
            <p className="text-[10px] text-slate-500 mt-1">{body.length} characters · ~{Math.round(body.split(/\s+/).filter(Boolean).length)} words</p>
          </div>

          <div className="flex gap-2 pt-2 flex-wrap">
            <Button onClick={saveDraft} disabled={savingDraft || (!body.trim() && !subject.trim())}
              className="bg-amber-600 hover:bg-amber-700 text-white" data-testid="save-draft-btn">
              {savingDraft ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              {activeDraftId ? "Update Draft" : "Save Draft"}
            </Button>
            <Button onClick={openPreview} disabled={!body.trim()}
              className="bg-slate-600 hover:bg-slate-700 text-white" data-testid="preview-btn">
              <Eye className="w-4 h-4 mr-1" /> Preview
            </Button>
            <Button onClick={() => downloadFile("pdf")} disabled={downloading || !body.trim()}
              className="bg-rose-600 hover:bg-rose-700 text-white" data-testid="download-pdf-btn">
              <Download className="w-4 h-4 mr-1" /> Download PDF
            </Button>
            <Button onClick={() => downloadFile("docx")} disabled={downloading || !body.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="download-docx-btn">
              <Download className="w-4 h-4 mr-1" /> Download Word (.docx)
            </Button>
            <div className="ml-auto flex gap-1">
              <Button onClick={() => openWhatsApp("phone")} disabled={!body.trim()}
                title="WhatsApp Phone"
                className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="wa-phone-btn">
                <MessageCircle className="w-4 h-4 mr-1" /> Phone
              </Button>
              <Button onClick={() => openWhatsApp("group")} disabled={!body.trim()}
                title="WhatsApp Group"
                className="bg-emerald-700 hover:bg-emerald-800 text-white" data-testid="wa-group-btn">
                <Users className="w-4 h-4 mr-1" /> Group
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Drafts Dialog */}
      <Dialog open={draftsOpen} onOpenChange={setDraftsOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg" data-testid="drafts-dialog">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <FolderOpen className="w-5 h-5" /> Saved Drafts
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Click on a draft to load it. Bookmark icon dabake delete kar sakte hain.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
            {drafts.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-8">Koi draft save nahi hai. Letter likh kar "Save Draft" dabaye.</p>
            )}
            {drafts.map(d => (
              <div
                key={d.id}
                role="button"
                tabIndex={0}
                onClick={() => loadDraft(d)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadDraft(d); } }}
                className="w-full text-left p-3 rounded bg-slate-900/60 border border-slate-700 hover:border-amber-600 hover:bg-slate-900 transition group flex items-start gap-3 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-600"
                data-testid={`draft-item-${d.id}`}
              >
                <FileText className="w-4 h-4 mt-1 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{d.title || 'Untitled'}</p>
                  <p className="text-[11px] text-slate-400 truncate">{d.subject || '(no subject)'}</p>
                  <p className="text-[10px] text-slate-500">
                    {d.updated_at ? new Date(d.updated_at).toLocaleString('en-GB') : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => deleteDraft(d, e)}
                  className="p-1 text-slate-500 hover:text-rose-400 opacity-60 group-hover:opacity-100"
                  data-testid={`draft-delete-${d.id}`}
                  aria-label="Delete draft"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraftsOpen(false)} className="text-slate-300">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Templates Dialog */}
      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl" data-testid="templates-dialog">
          <DialogHeader>
            <DialogTitle className="text-emerald-400 flex items-center gap-2">
              <BookTemplate className="w-5 h-5" /> Letter Templates Library
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Pre-written letters rice millers ke common scenarios ke liye. Apply karne ke baad edit kar sakte hain.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-2">
            {templates.map(t => {
              const Icon = TEMPLATE_ICONS[t.icon] || FileText;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="text-left p-3 rounded bg-slate-900/60 border border-slate-700 hover:border-emerald-600 hover:bg-slate-900 transition flex items-start gap-3"
                  data-testid={`template-item-${t.id}`}
                >
                  <div className="p-2 rounded bg-emerald-900/40 shrink-0">
                    <Icon className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{t.name}</p>
                    <p className="text-[11px] text-emerald-400 uppercase tracking-wider">{t.category}</p>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{t.preview}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTemplatesOpen(false)} className="text-slate-300">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Share Dialog */}
      <Dialog open={waOpen.open} onOpenChange={(o) => !o && setWaOpen({ open: false, mode: "phone" })}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md" data-testid="wa-dialog">
          <DialogHeader>
            <DialogTitle className="text-emerald-400 flex items-center gap-2">
              {waOpen.mode === 'phone' ? <MessageCircle className="w-5 h-5" /> : <Users className="w-5 h-5" />}
              WhatsApp Share — {waOpen.mode === 'phone' ? 'Phone Number' : 'Group'}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Letter PDF generate ho ke 360Messenger ke through WhatsApp pe bhej diya jayega.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {waOpen.mode === 'phone' ? (
              <div>
                <Label className="text-slate-400 text-xs">Phone Number (10 digit, country code optional)</Label>
                <Input value={waPhone} onChange={(e) => setWaPhone(e.target.value)}
                  placeholder="9876543210" className="bg-slate-700 border-slate-600 text-white"
                  data-testid="wa-phone-input" />
              </div>
            ) : (
              <div>
                <Label className="text-slate-400 text-xs">Group ID (blank = default group from Settings)</Label>
                <Input value={waGroupId} onChange={(e) => setWaGroupId(e.target.value)}
                  placeholder="120363xxxx@g.us" className="bg-slate-700 border-slate-600 text-white font-mono text-xs"
                  data-testid="wa-group-input" />
              </div>
            )}
            <div>
              <Label className="text-slate-400 text-xs">Optional Custom Message (default: "Please find attached letter")</Label>
              <Textarea value={waCaption} onChange={(e) => setWaCaption(e.target.value)} rows={3}
                placeholder="(Optional) Add a personal note above the PDF" className="bg-slate-700 border-slate-600 text-white"
                data-testid="wa-caption-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWaOpen({ open: false, mode: "phone" })} className="text-slate-300">Cancel</Button>
            <Button onClick={sendWhatsApp} disabled={waBusy || (waOpen.mode === 'phone' && !waPhone.trim())}
              className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="wa-send-btn">
              {waBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
              {waBusy ? "Sending..." : "Send via WhatsApp"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={(o) => !o && closePreview()}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-5xl h-[90vh] flex flex-col p-0" data-testid="preview-dialog">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="text-slate-200 flex items-center gap-2">
              <Eye className="w-5 h-5" /> Letter Preview
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Live PDF preview — yahi exact letter download/WhatsApp share hoga
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 bg-slate-900 mx-6 rounded overflow-hidden">
            {previewLoading ? (
              <div className="h-full flex items-center justify-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Generating preview...
              </div>
            ) : previewUrl ? (
              <iframe
                src={previewUrl}
                title="Letter Preview"
                className="w-full h-full border-0 bg-white"
                data-testid="preview-iframe"
              />
            ) : null}
          </div>
          <DialogFooter className="px-6 py-4">
            <Button variant="ghost" onClick={closePreview} className="text-slate-300">Close</Button>
            <Button onClick={() => downloadFile("pdf")} disabled={downloading} className="bg-rose-600 hover:bg-rose-700 text-white">
              <Download className="w-4 h-4 mr-1" /> Download PDF
            </Button>
            <Button onClick={() => downloadFile("docx")} disabled={downloading} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Download className="w-4 h-4 mr-1" /> Download Word
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg" data-testid="letter-pad-settings-dialog">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <SettingsIcon className="w-5 h-5" /> Letter Pad Settings
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
            {/* === Letterhead Fields === */}
            <div className="space-y-2 p-3 rounded bg-slate-900/50 border border-slate-700">
              <p className="text-xs text-amber-400 uppercase tracking-wider font-semibold">Letterhead Details</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-slate-400 text-xs">GSTIN</Label>
                  <Input value={settings.gstin || ""} onChange={(e) => setSettings({ ...settings, gstin: e.target.value })}
                    placeholder="21AYUPJ8378A1Z9" className="bg-slate-700 border-slate-600 text-white"
                    data-testid="settings-gstin" />
                </div>
                <div>
                  <Label className="text-slate-400 text-xs">License No.</Label>
                  <Input value={settings.license_number || ""} onChange={(e) => setSettings({ ...settings, license_number: e.target.value })}
                    placeholder="(Optional)" className="bg-slate-700 border-slate-600 text-white"
                    data-testid="settings-license" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-slate-400 text-xs">Mobile 1</Label>
                  <Input value={settings.phone || ""} onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                    placeholder="97693 53159" className="bg-slate-700 border-slate-600 text-white"
                    data-testid="settings-phone" />
                </div>
                <div>
                  <Label className="text-slate-400 text-xs">Mobile 2</Label>
                  <Input value={settings.phone_secondary || ""} onChange={(e) => setSettings({ ...settings, phone_secondary: e.target.value })}
                    placeholder="72059 30002" className="bg-slate-700 border-slate-600 text-white"
                    data-testid="settings-phone2" />
                </div>
              </div>
              <div>
                <Label className="text-slate-400 text-xs">Email</Label>
                <Input value={settings.email || ""} onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                  placeholder="navkaragro2@gmail.com" className="bg-slate-700 border-slate-600 text-white"
                  data-testid="settings-email" />
              </div>
              <div>
                <Label className="text-slate-400 text-xs">Address (single line)</Label>
                <Input value={settings.address || ""} onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                  placeholder="Laitara Road, Jolko - 766012, Dist. Kalahandi (Odisha)"
                  className="bg-slate-700 border-slate-600 text-white"
                  data-testid="settings-address" />
              </div>
            </div>

            {/* === Signature Block === */}
            <div className="space-y-2 p-3 rounded bg-slate-900/50 border border-slate-700">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Signature Block</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-slate-400 text-xs">Signature Name</Label>
                  <Input value={settings.signature_name || ""} onChange={(e) => setSettings({ ...settings, signature_name: e.target.value })}
                    placeholder="Aditya Jain" className="bg-slate-700 border-slate-600 text-white"
                    data-testid="settings-signature-name" />
                </div>
                <div>
                  <Label className="text-slate-400 text-xs">Designation</Label>
                  <Input value={settings.signature_designation || ""} onChange={(e) => setSettings({ ...settings, signature_designation: e.target.value })}
                    placeholder="Proprietor" className="bg-slate-700 border-slate-600 text-white"
                    data-testid="settings-signature-designation" />
                </div>
              </div>
            </div>

            {/* === AI Assistant === */}
            <div className="space-y-2 p-3 rounded bg-slate-900/50 border border-slate-700">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">AI Letter Assistant</p>
                <Switch checked={settings.ai_enabled} onCheckedChange={(v) => setSettings({ ...settings, ai_enabled: v })}
                  data-testid="settings-ai-toggle" />
              </div>

              {settings.ai_enabled && (
                <>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    AI key apni daalein. <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-emerald-400 underline">Google AI Studio</a> se Gemini key 2-min mein FREE milti hai (1500 letters/day).
                  </p>
                  <div>
                    <Label className="text-slate-400 text-xs">AI Provider</Label>
                    <Select value={settings.ai_provider} onValueChange={(v) => setSettings({ ...settings, ai_provider: v })}>
                      <SelectTrigger className="bg-slate-700 border-slate-600 text-white" data-testid="settings-ai-provider">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gemini">Gemini 2.5 Flash (Free, Recommended)</SelectItem>
                        <SelectItem value="openai">GPT-5-mini (OpenAI, Paid)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {settings.ai_provider === "gemini" && (
                    <div>
                      <Label className="text-slate-400 text-xs flex items-center gap-1">
                        <KeyRound className="w-3 h-3" /> Gemini API Key {settings.has_gemini_key && <span className="text-emerald-400 text-[10px]">(✓ Saved)</span>}
                      </Label>
                      <Input type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)}
                        placeholder={settings.has_gemini_key ? "•••••••• (paste new to update)" : "AIza..."}
                        className="bg-slate-700 border-slate-600 text-white font-mono"
                        data-testid="settings-gemini-key" />
                      <p className="text-[10px] text-slate-500 mt-1">
                        FREE key: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-emerald-400 underline">aistudio.google.com/app/apikey</a>
                      </p>
                    </div>
                  )}
                  {settings.ai_provider === "openai" && (
                    <div>
                      <Label className="text-slate-400 text-xs flex items-center gap-1">
                        <KeyRound className="w-3 h-3" /> OpenAI API Key {settings.has_openai_key && <span className="text-emerald-400 text-[10px]">(✓ Saved)</span>}
                      </Label>
                      <Input type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)}
                        placeholder={settings.has_openai_key ? "•••••••• (paste new to update)" : "sk-..."}
                        className="bg-slate-700 border-slate-600 text-white font-mono"
                        data-testid="settings-openai-key" />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Paid key: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-emerald-400 underline">platform.openai.com/api-keys</a>
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSettingsOpen(false)} className="text-slate-300">Cancel</Button>
            <Button onClick={saveSettings} disabled={savingSettings} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="settings-save-btn">
              <Save className="w-4 h-4 mr-1" /> {savingSettings ? "Saving..." : "Save Settings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Dialog */}
      <Dialog open={aiDialog.open} onOpenChange={(o) => !o && setAiDialog({ open: false, mode: "generate" })}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-xl" data-testid="ai-dialog">
          <DialogHeader>
            <DialogTitle className="text-emerald-400 flex items-center gap-2">
              {aiDialog.mode === 'generate' ? <Sparkles className="w-5 h-5" /> : aiDialog.mode === 'improve' ? <Wand2 className="w-5 h-5" /> : <Languages className="w-5 h-5" />}
              {aiDialog.mode === 'generate' ? 'AI Letter Generate' : aiDialog.mode === 'improve' ? 'AI Improve Letter' : 'AI Translate Letter'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {aiDialog.mode === 'translate' && (
              <div>
                <Label className="text-slate-400 text-xs">Target Language</Label>
                <Select value={aiTargetLang} onValueChange={setAiTargetLang}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white" data-testid="ai-target-lang">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-slate-400 text-xs">
                {aiDialog.mode === 'generate' ? 'Bataye kya letter chahiye (Hindi/English mein bhi chalega)' : 'Existing letter text'}
              </Label>
              <Textarea value={aiInput} onChange={(e) => setAiInput(e.target.value)} rows={6}
                placeholder={aiDialog.mode === 'generate'
                  ? 'Example: "Bank ko letter likho mere current account ka March 2026 ka statement chahiye"'
                  : ''}
                className="bg-slate-700 border-slate-600 text-white"
                data-testid="ai-input" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAiDialog({ open: false, mode: "generate" })} className="text-slate-300">Cancel</Button>
            <Button onClick={runAi} disabled={aiBusy} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="ai-run-btn">
              <Sparkles className="w-4 h-4 mr-1" /> {aiBusy ? "Working..." : "Run AI"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LetterPadTab;
