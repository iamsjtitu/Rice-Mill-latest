import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import {
  FileText, Download, Sparkles, Languages, Wand2, Settings as SettingsIcon, Save, KeyRound,
} from "lucide-react";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

const LANGS = ["English", "Hindi", "Odia"];

const LetterPadTab = () => {
  const today = new Date().toISOString().slice(0, 10).split('-').reverse().join('-');
  const [refNo, setRefNo] = useState("");
  const [date, setDate] = useState(today);
  const [toAddress, setToAddress] = useState("");
  const [subject, setSubject] = useState("");
  const [references, setReferences] = useState("");
  const [body, setBody] = useState("");
  const [downloading, setDownloading] = useState(false);

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

  const loadSettings = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/letter-pad/settings`);
      setSettings(res.data);
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

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
      setSettings(res.data);
      setGeminiKey("");
      setOpenaiKey("");
      toast.success("Letterhead settings save ho gayi");
      setSettingsOpen(false);
    } catch (e) {
      toast.error("Settings save nahi ho payi");
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
      toast.success(`AI ne ${aiDialog.mode === 'generate' ? 'letter likha' : aiDialog.mode === 'improve' ? 'letter sudhara' : 'translate kiya'} (${res.data.provider})`);
      setAiDialog({ open: false, mode: "generate" });
    } catch (e) {
      toast.error(e.response?.data?.detail || "AI fail ho gaya");
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="letter-pad-tab">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-amber-400 text-xl font-bold">Company Letter Pad</h2>
          <p className="text-slate-400 text-xs">Professional letterhead — PDF / Word download. {aiAvailable ? <span className="text-emerald-400">AI Assistant active</span> : <span className="text-slate-500">AI off</span>}</p>
        </div>
        <Button onClick={() => setSettingsOpen(true)} variant="outline" size="sm" className="border-slate-600 text-slate-300" data-testid="letter-pad-settings-btn">
          <SettingsIcon className="w-4 h-4 mr-1" /> Settings
        </Button>
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

          <div className="flex gap-2 pt-2">
            <Button onClick={() => downloadFile("pdf")} disabled={downloading || !body.trim()}
              className="bg-rose-600 hover:bg-rose-700 text-white" data-testid="download-pdf-btn">
              <Download className="w-4 h-4 mr-1" /> Download PDF
            </Button>
            <Button onClick={() => downloadFile("docx")} disabled={downloading || !body.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="download-docx-btn">
              <Download className="w-4 h-4 mr-1" /> Download Word (.docx)
            </Button>
          </div>
        </CardContent>
      </Card>

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
                  <div>
                    <Label className="text-slate-400 text-xs flex items-center gap-1">
                      <KeyRound className="w-3 h-3" /> Gemini API Key {settings.has_gemini_key && <span className="text-emerald-400 text-[10px]">(✓ Saved)</span>}
                    </Label>
                    <Input type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)}
                      placeholder={settings.has_gemini_key ? "•••••••• (paste new to update)" : "AIza..."}
                      className="bg-slate-700 border-slate-600 text-white font-mono"
                      data-testid="settings-gemini-key" />
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs flex items-center gap-1">
                      <KeyRound className="w-3 h-3" /> OpenAI API Key {settings.has_openai_key && <span className="text-emerald-400 text-[10px]">(✓ Saved)</span>}
                    </Label>
                    <Input type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)}
                      placeholder={settings.has_openai_key ? "•••••••• (paste new to update)" : "sk-..."}
                      className="bg-slate-700 border-slate-600 text-white font-mono"
                      data-testid="settings-openai-key" />
                  </div>
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
