import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, RefreshCw, Send, Scale, CheckCircle } from "lucide-react";
import { API } from "./settingsConstants";

function MessagingTab() {
  // WhatsApp state
  const [waSettings, setWaSettings] = useState({ api_key: "", country_code: "91", enabled: false, api_key_masked: "", default_numbers: [], default_group_id: "", default_group_name: "", group_schedule_enabled: false, group_schedule_time: "" });
  const [waForm, setWaForm] = useState({ api_key: "", country_code: "91", default_numbers: "", default_group_id: "", default_group_name: "", group_schedule_enabled: false, group_schedule_time: "", enabled: false });
  const [waTestPhone, setWaTestPhone] = useState("");
  const [waLoading, setWaLoading] = useState(false);
  const [waGroups, setWaGroups] = useState([]);
  const [waGroupsLoading, setWaGroupsLoading] = useState(false);

  // Telegram state
  const [telegramConfig, setTelegramConfig] = useState({ bot_token: "", chat_ids: [], schedule_time: "21:00", enabled: false });
  const [telegramLogs, setTelegramLogs] = useState([]);
  const [telegramLoading, setTelegramLoading] = useState(false);

  const fetchWaSettings = async () => {
    try {
      const res = await axios.get(`${API}/whatsapp/settings`);
      setWaSettings(res.data);
      setWaForm({
        api_key: res.data.api_key || "",
        country_code: res.data.country_code || "91",
        default_numbers: (res.data.default_numbers || []).join(", "),
        default_group_id: res.data.default_group_id || "",
        default_group_name: res.data.default_group_name || "",
        group_schedule_enabled: res.data.group_schedule_enabled || false,
        group_schedule_time: res.data.group_schedule_time || "",
        enabled: res.data.enabled || false
      });
    } catch (e) { console.error("WA settings fetch error:", e); }
  };

  const fetchTelegramConfig = async () => {
    try { const res = await axios.get(`${API}/telegram/config`); setTelegramConfig(res.data); } catch (e) { console.error('Telegram config fetch error:', e); }
  };
  const fetchTelegramLogs = async () => {
    try { const res = await axios.get(`${API}/telegram/logs`); setTelegramLogs(res.data); } catch (e) { console.error('Telegram logs fetch error:', e); }
  };

  useEffect(() => {
    fetchWaSettings();
    fetchWaGroups();
    fetchTelegramConfig();
    fetchTelegramLogs();
  }, []);

  const fetchWaGroups = async () => {
    setWaGroupsLoading(true);
    try {
      const res = await axios.get(`${API}/whatsapp/groups`);
      if (res.data.success) setWaGroups(res.data.groups || []);
    } catch (e) { console.error('WhatsApp groups fetch error:', e); }
    setWaGroupsLoading(false);
  };

  const handleSaveTelegramConfig = async () => {
    setTelegramLoading(true);
    try {
      const res = await axios.post(`${API}/telegram/config`, telegramConfig);
      toast.success(res.data.message || "Telegram config save ho gayi!");
      fetchTelegramConfig();
      window.dispatchEvent(new Event("messaging-config-changed"));
    } catch (e) { toast.error(e.response?.data?.detail || "Telegram config save nahi hua"); }
    setTelegramLoading(false);
  };

  const handleTestTelegram = async () => {
    setTelegramLoading(true);
    try {
      const res = await axios.post(`${API}/telegram/test`, {
        bot_token: telegramConfig.bot_token, chat_ids: telegramConfig.chat_ids
      });
      toast.success(res.data.message || "Test message bhej diya!");
    } catch (e) { toast.error(e.response?.data?.detail || "Test message nahi gaya"); }
    setTelegramLoading(false);
  };

  const handleSendReportNow = async () => {
    setTelegramLoading(true);
    try {
      const res = await axios.post(`${API}/telegram/send-report`, {
        date: new Date().toISOString().split('T')[0]
      });
      if (res.data.success) {
        toast.success(res.data.message || "Report bhej diya!");
      } else {
        const failed = (res.data.details || []).filter(d => !d.ok).map(d => `${d.label}: ${d.error}`).join(', ');
        toast.error(`Failed: ${failed || res.data.message}`);
      }
      fetchTelegramLogs();
    } catch (e) { toast.error(e.response?.data?.detail || "Report nahi gaya"); }
    setTelegramLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* WhatsApp Integration */}
      <Card className="bg-slate-800 border-slate-700" data-testid="whatsapp-section">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-green-400 flex items-center gap-2">
              <Send className="w-5 h-5" />
              WhatsApp Integration / व्हाट्सएप
            </CardTitle>
            <div className="flex items-center gap-3 cursor-pointer select-none" data-testid="wa-master-toggle">
              <span className={`text-sm font-bold ${waForm.enabled ? 'text-green-400' : 'text-red-400'}`}>
                {waForm.enabled ? 'ON' : 'OFF'}
              </span>
              <div className="relative" onClick={async () => {
                const newEnabled = !waForm.enabled;
                setWaForm(prev => ({ ...prev, enabled: newEnabled }));
                try {
                  await axios.put(`${API}/whatsapp/settings`, {
                    api_key: waForm.api_key, country_code: waForm.country_code,
                    enabled: newEnabled,
                    default_numbers: waForm.default_numbers,
                    default_group_id: waForm.default_group_id, default_group_name: waForm.default_group_name,
                    group_schedule_enabled: waForm.group_schedule_enabled, group_schedule_time: waForm.group_schedule_time
                  });
                  window.dispatchEvent(new Event("messaging-config-changed"));
                  toast.success(newEnabled ? "WhatsApp ON!" : "WhatsApp OFF!");
                } catch { toast.error("Save fail!"); setWaForm(prev => ({ ...prev, enabled: !newEnabled })); }
              }}>
                <div className={`w-12 h-6 rounded-full transition-colors ${waForm.enabled ? 'bg-green-600' : 'bg-slate-600'}`} />
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${waForm.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </div>
            </div>
          </div>
          <p className="text-slate-400 text-sm">
            {waForm.enabled ? 'WhatsApp buttons sab jagah dikhenge. OFF karo toh chhup jayenge.' : 'WhatsApp OFF hai - sab buttons chhupe hain. ON karein aur Save karein.'}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Status */}
          <div className={`p-3 rounded-lg border ${waSettings.enabled && waSettings.api_key ? 'bg-green-900/30 border-green-700' : 'bg-slate-700/50 border-slate-600'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`font-semibold text-sm ${waSettings.enabled && waSettings.api_key ? 'text-green-400' : 'text-slate-400'}`}>
                  {waSettings.enabled && waSettings.api_key ? 'WhatsApp Connected' : 'WhatsApp Not Connected'}
                </p>
                {waSettings.api_key_masked && <p className="text-slate-400 text-xs mt-1">API Key: {waSettings.api_key_masked}</p>}
              </div>
              <p className="text-slate-400 text-xs">
                Country: +{waSettings.country_code || '91'} | Numbers: {(waSettings.default_numbers || []).length || 'None'} | Group: {waSettings.default_group_name || 'Not set'} {waSettings.group_schedule_enabled ? `| Auto: ${waSettings.group_schedule_time}` : ''}
              </p>
            </div>
          </div>

          {/* API Key Input */}
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-8">
              <Label className="text-slate-400 text-xs mb-1 block">360Messenger API Key</Label>
              <Input type="password" value={waForm.api_key}
                onChange={(e) => setWaForm(prev => ({ ...prev, api_key: e.target.value }))}
                placeholder="API key paste karein..."
                className="bg-slate-700 border-slate-600 text-white text-sm" data-testid="wa-api-key-input" />
            </div>
            <div className="col-span-4">
              <Label className="text-slate-400 text-xs mb-1 block">Country Code</Label>
              <Input value={waForm.country_code}
                onChange={(e) => setWaForm(prev => ({ ...prev, country_code: e.target.value }))}
                placeholder="91"
                className="bg-slate-700 border-slate-600 text-white text-sm" data-testid="wa-country-code-input" />
            </div>
          </div>

          {/* Default Numbers */}
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">Default Numbers (comma se alag karein)</Label>
            <Input value={waForm.default_numbers}
              onChange={(e) => setWaForm(prev => ({ ...prev, default_numbers: e.target.value }))}
              placeholder="9876543210, 9876543211"
              className="bg-slate-700 border-slate-600 text-white text-sm" data-testid="wa-default-numbers-input" />
            <p className="text-slate-500 text-xs mt-1">Ye numbers pe directly message jayega bina prompt ke.</p>
          </div>

          {/* Default Group for "Send to Group" */}
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">Default WhatsApp Group (Send to Group ke liye)</Label>
            <div className="flex items-center gap-2">
              <select
                value={waForm.default_group_id}
                onChange={(e) => {
                  const gId = e.target.value;
                  const gName = waGroups.find(g => g.id === gId)?.name || "";
                  setWaForm(prev => ({ ...prev, default_group_id: gId, default_group_name: gName }));
                }}
                className="flex-1 bg-slate-700 border border-slate-600 text-white text-sm rounded-md px-3 py-2"
                data-testid="wa-default-group-select"
              >
                <option value="">-- Group select karein --</option>
                {waGroups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <Button variant="ghost" size="sm" onClick={fetchWaGroups} disabled={waGroupsLoading} className="text-slate-400 shrink-0" data-testid="wa-refresh-groups">
                <RefreshCw className={`w-4 h-4 ${waGroupsLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            {waForm.default_group_name && <p className="text-green-400 text-xs mt-1">Selected: {waForm.default_group_name}</p>}
            <p className="text-slate-500 text-xs mt-1">Ye group har jagah "Send to Group" mein auto-select hoga.</p>
          </div>

          {/* Auto Schedule - Daily Report to Group */}
          {waForm.default_group_id && (
            <div className="p-3 rounded-lg border border-slate-600 bg-slate-700/30 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-slate-300 text-sm font-medium">Auto Daily Report → Group</Label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={waForm.group_schedule_enabled}
                    onChange={(e) => setWaForm(prev => ({ ...prev, group_schedule_enabled: e.target.checked }))}
                    className="w-4 h-4 rounded accent-green-500" data-testid="wa-schedule-toggle" />
                  <span className={`text-xs font-semibold ${waForm.group_schedule_enabled ? 'text-green-400' : 'text-slate-500'}`}>
                    {waForm.group_schedule_enabled ? 'ON' : 'OFF'}
                  </span>
                </label>
              </div>
              {waForm.group_schedule_enabled && (
                <div className="flex items-center gap-3">
                  <Label className="text-slate-400 text-xs shrink-0">Time:</Label>
                  <Input type="time" value={waForm.group_schedule_time}
                    onChange={(e) => setWaForm(prev => ({ ...prev, group_schedule_time: e.target.value }))}
                    className="bg-slate-700 border-slate-600 text-white text-sm w-36" data-testid="wa-schedule-time" />
                  <p className="text-slate-500 text-xs">Roz is time pe daily report {waForm.default_group_name || 'group'} mein jayegi</p>
                </div>
              )}
            </div>
          )}

          <Button
            onClick={async () => {
              try {
                setWaLoading(true);
                await axios.put(`${API}/whatsapp/settings`, {
                  api_key: waForm.api_key, country_code: waForm.country_code,
                  enabled: waForm.enabled,
                  default_numbers: waForm.default_numbers,
                  default_group_id: waForm.default_group_id, default_group_name: waForm.default_group_name,
                  group_schedule_enabled: waForm.group_schedule_enabled, group_schedule_time: waForm.group_schedule_time
                });
                toast.success("WhatsApp settings save ho gayi!");
                fetchWaSettings();
                window.dispatchEvent(new Event("messaging-config-changed"));
              } catch { toast.error("Save fail!"); }
              finally { setWaLoading(false); }
            }}
            disabled={waLoading || !waForm.api_key}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold"
            data-testid="wa-save-btn"
          >
            Save WhatsApp Settings
          </Button>

          {/* Test Message */}
          {waSettings.enabled && waSettings.api_key && (
            <div className="border border-slate-600 rounded-lg p-4 bg-slate-900/50">
              <p className="text-slate-300 text-sm font-semibold mb-2">Test Message / टेस्ट मैसेज</p>
              <div className="flex gap-2">
                <Input value={waTestPhone}
                  onChange={(e) => setWaTestPhone(e.target.value)}
                  placeholder="Phone number (e.g. 9876543210)"
                  className="bg-slate-700 border-slate-600 text-white text-sm flex-1" data-testid="wa-test-phone" />
                <Button
                  onClick={async () => {
                    if (!waTestPhone) { toast.error("Phone number daalein"); return; }
                    try {
                      setWaLoading(true);
                      const res = await axios.post(`${API}/whatsapp/test`, { phone: waTestPhone });
                      if (res.data.success) toast.success("Test message bhej diya!");
                      else toast.error(res.data.error || "Test fail");
                    } catch (e) { toast.error(e.response?.data?.detail || "Test fail"); }
                    finally { setWaLoading(false); }
                  }}
                  disabled={waLoading} variant="outline"
                  className="border-green-600 text-green-400 hover:bg-green-900/30" data-testid="wa-test-btn"
                >
                  {waLoading ? 'Sending...' : 'Send Test'}
                </Button>
              </div>
            </div>
          )}

          <div className="text-center text-slate-500 text-xs">
            <p>360Messenger API use hota hai | <a href="https://360messenger.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">360messenger.com</a></p>
          </div>
        </CardContent>
      </Card>

      {/* Telegram Bot */}
      <Card className="bg-slate-800 border-slate-700" data-testid="telegram-section">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-blue-400 flex items-center gap-2">
              <Send className="w-5 h-5" />
              Telegram Bot - Daily Report
            </CardTitle>
            <div className="flex items-center gap-3 cursor-pointer select-none" data-testid="tg-master-toggle">
              <span className={`text-sm font-bold ${telegramConfig.enabled ? 'text-blue-400' : 'text-red-400'}`}>
                {telegramConfig.enabled ? 'ON' : 'OFF'}
              </span>
              <div className="relative" onClick={() => setTelegramConfig(prev => ({ ...prev, enabled: !prev.enabled }))}>
                <div className={`w-12 h-6 rounded-full transition-colors ${telegramConfig.enabled ? 'bg-blue-600' : 'bg-slate-600'}`} />
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${telegramConfig.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </div>
            </div>
          </div>
          <p className="text-slate-400 text-sm">
            {telegramConfig.enabled ? 'Telegram buttons dikhenge + auto schedule ON' : 'Telegram OFF hai - sab buttons chhupe hain. ON karein aur Save karein.'}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Bot Token */}
          <div>
            <Label className="text-slate-300">Bot Token</Label>
            <Input
              value={telegramConfig.bot_token}
              onChange={(e) => setTelegramConfig(prev => ({ ...prev, bot_token: e.target.value }))}
              placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v..."
              className="bg-slate-700 border-slate-600 text-white mt-1 font-mono text-sm"
              type="password" data-testid="telegram-bot-token" />
            <p className="text-xs text-slate-500 mt-1">@BotFather se milega. /newbot command use karein.</p>
          </div>

          {/* Bot Info */}
          {telegramConfig.bot_name && (
            <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3">
              <p className="text-blue-400 text-sm font-semibold">Connected Bot: {telegramConfig.bot_name}</p>
              {telegramConfig.bot_username && <p className="text-blue-300 text-xs">@{telegramConfig.bot_username}</p>}
            </div>
          )}

          {/* Recipients */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-slate-300 font-semibold">Recipients ({(telegramConfig.chat_ids || []).length})</Label>
              <Button
                onClick={() => setTelegramConfig(prev => ({ ...prev, chat_ids: [...(prev.chat_ids || []), { chat_id: "", label: "" }] }))}
                variant="outline" size="sm"
                className="border-blue-600 text-blue-400 hover:bg-blue-900/30 h-7 text-xs"
                data-testid="telegram-add-recipient"
              >
                <Plus className="w-3 h-3 mr-1" /> Add Recipient
              </Button>
            </div>
            <p className="text-xs text-slate-500">Individual users, groups ya channels - sabko report bhej sakte hain</p>

            {(telegramConfig.chat_ids || []).length === 0 && (
              <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-4 text-center text-slate-400 text-sm">
                Koi recipient nahi hai. "Add Recipient" click karein.
              </div>
            )}

            {(telegramConfig.chat_ids || []).map((item, idx) => (
              <div key={idx} className="flex gap-2 items-center bg-slate-700/30 p-2 rounded-lg border border-slate-600" data-testid={`telegram-recipient-${idx}`}>
                <div className="flex-1">
                  <Input
                    value={item.label}
                    onChange={(e) => {
                      const updated = [...(telegramConfig.chat_ids || [])];
                      updated[idx] = { ...updated[idx], label: e.target.value };
                      setTelegramConfig(prev => ({ ...prev, chat_ids: updated }));
                    }}
                    placeholder="Name (Owner, Accountant, Group...)"
                    className="bg-slate-700 border-slate-600 text-white h-8 text-xs mb-1"
                    data-testid={`telegram-recipient-label-${idx}`}
                  />
                  <Input
                    value={item.chat_id}
                    onChange={(e) => {
                      const updated = [...(telegramConfig.chat_ids || [])];
                      updated[idx] = { ...updated[idx], chat_id: e.target.value };
                      setTelegramConfig(prev => ({ ...prev, chat_ids: updated }));
                    }}
                    placeholder="Chat ID (e.g. 123456789 ya -100...)"
                    className="bg-slate-700 border-slate-600 text-white h-8 text-xs font-mono"
                    data-testid={`telegram-recipient-id-${idx}`}
                  />
                </div>
                <Button
                  onClick={() => {
                    const updated = (telegramConfig.chat_ids || []).filter((_, i) => i !== idx);
                    setTelegramConfig(prev => ({ ...prev, chat_ids: updated }));
                  }}
                  variant="ghost" size="sm"
                  className="text-red-400 hover:text-red-300 hover:bg-red-900/20 h-8 w-8 p-0"
                  data-testid={`telegram-recipient-remove-${idx}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* Schedule Time */}
          <div>
            <Label className="text-slate-300">Schedule Time / समय</Label>
            <Input
              type="time" value={telegramConfig.schedule_time}
              onChange={(e) => setTelegramConfig(prev => ({ ...prev, schedule_time: e.target.value }))}
              className="bg-slate-700 border-slate-600 text-white mt-1"
              data-testid="telegram-schedule-time" />
            <p className="text-xs text-slate-500 mt-1">Roz is time pe report bhejega (jab Telegram ON ho)</p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={handleSaveTelegramConfig}
              disabled={telegramLoading || !telegramConfig.bot_token || !(telegramConfig.chat_ids || []).some(c => c.chat_id)}
              className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="telegram-save-btn"
            >
              {telegramLoading ? 'Saving...' : 'Save Config'}
            </Button>
            <Button
              onClick={handleTestTelegram}
              disabled={telegramLoading || !telegramConfig.bot_token || !(telegramConfig.chat_ids || []).some(c => c.chat_id)}
              variant="outline" className="border-blue-600 text-blue-400 hover:bg-blue-900/30" data-testid="telegram-test-btn"
            >
              Test Message
            </Button>
            <Button
              onClick={handleSendReportNow}
              disabled={telegramLoading || !telegramConfig.bot_token || !(telegramConfig.chat_ids || []).some(c => c.chat_id)}
              variant="outline" className="border-green-600 text-green-400 hover:bg-green-900/30" data-testid="telegram-send-now-btn"
            >
              <Send className="w-4 h-4 mr-1" /> Send Report Now
            </Button>
          </div>

          {/* Recent Logs */}
          {telegramLogs.length > 0 && (
            <div className="space-y-2">
              <p className="text-slate-300 text-sm font-semibold">Recent Sends:</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {telegramLogs.map((log, idx) => (
                  <div key={`tg-log-${log.date}-${idx}`} className={`flex items-center justify-between text-xs p-2 rounded ${log.status === 'success' ? 'bg-green-900/20 border border-green-800/30' : 'bg-red-900/20 border border-red-800/30'}`} data-testid={`telegram-log-${idx}`}>
                    <span className="text-slate-300">{log.date} - {log.type === 'scheduled' ? 'Auto' : 'Manual'}{log.sent_to ? ` (${log.sent_to}/${log.total})` : ''}</span>
                    <span className={log.status === 'success' ? 'text-green-400' : 'text-red-400'}>
                      {log.status === 'success' ? 'Sent' : 'Failed'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Setup Guide */}
          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-xs text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300">Setup Guide:</p>
            <p>1. Telegram mein @BotFather search karein, /newbot command bhejein</p>
            <p>2. Jo Token mile wo upar paste karein</p>
            <p>3. Bot ko start karein ya group mein add karein</p>
            <p>4. @userinfobot se apna Chat ID lein, group ke liye @getidsbot use karein</p>
            <p>5. "Add Recipient" se naam aur Chat ID add karein (multiple log add kar sakte hain)</p>
            <p>6. "Test Message" se verify karein, phir Save karein</p>
          </div>
        </CardContent>
      </Card>

      {/* Auto Vehicle Weight Messaging */}
      <AutoVWMessagingCard />
    </div>
  );
}

// ---- Auto Vehicle Weight Messaging Card ----
function AutoVWMessagingCard() {
  const [enabled, setEnabled] = useState(false);
  const [waGroupId, setWaGroupId] = useState('');
  const [waGroupName, setWaGroupName] = useState('');
  const [tgChatIds, setTgChatIds] = useState([]);
  const [newTgName, setNewTgName] = useState('');
  const [newTgChatId, setNewTgChatId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [waGroups, setWaGroups] = useState([]);
  const [waGroupsLoading, setWaGroupsLoading] = useState(false);

  useEffect(() => {
    axios.get(`${API}/vehicle-weight/auto-notify-setting`)
      .then(r => {
        setEnabled(r.data.enabled || false);
        setWaGroupId(r.data.wa_group_id || '');
        setWaGroupName(r.data.wa_group_name || '');
        setTgChatIds(r.data.tg_chat_ids || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const fetchWaGroups = async () => {
    setWaGroupsLoading(true);
    try {
      const res = await axios.get(`${API}/whatsapp/groups`);
      if (res.data.success) setWaGroups(res.data.groups || []);
    } catch (e) { console.error('WhatsApp groups fetch error:', e); }
    setWaGroupsLoading(false);
  };

  const toggle = async () => {
    const newVal = !enabled;
    setEnabled(newVal);
    try {
      await axios.put(`${API}/vehicle-weight/auto-notify-setting`, { enabled: newVal });
      toast.success(newVal ? "Auto VW Messaging ON" : "Auto VW Messaging OFF");
    } catch { toast.error("Setting save error"); setEnabled(!newVal); }
  };

  const saveGroupConfig = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/vehicle-weight/auto-notify-setting`, {
        wa_group_id: waGroupId,
        wa_group_name: waGroupName,
        tg_chat_ids: tgChatIds,
      });
      toast.success("VW Messaging group config save ho gaya!");
    } catch { toast.error("Save error"); }
    setSaving(false);
  };

  const addTgChatId = () => {
    if (!newTgChatId.trim()) return;
    setTgChatIds(prev => [...prev, { name: newTgName.trim() || `Chat ${prev.length + 1}`, chat_id: newTgChatId.trim() }]);
    setNewTgName('');
    setNewTgChatId('');
  };

  const removeTgChatId = (idx) => {
    setTgChatIds(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <Card className="bg-slate-800 border-slate-700" data-testid="auto-vw-messaging-section">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-amber-400 flex items-center gap-2">
            <Scale className="w-5 h-5" />
            Auto Vehicle Weight Messaging
          </CardTitle>
          <div className="flex items-center gap-3 cursor-pointer select-none" data-testid="auto-vw-toggle">
            <span className={`text-sm font-bold ${enabled ? 'text-amber-400' : 'text-red-400'}`}>
              {loading ? '...' : enabled ? 'ON' : 'OFF'}
            </span>
            <div className="relative" onClick={toggle}>
              <div className={`w-12 h-6 rounded-full transition-colors ${enabled ? 'bg-amber-600' : 'bg-slate-600'}`} />
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </div>
          </div>
        </div>
        <p className="text-slate-400 text-sm mt-1">
          {enabled
            ? 'Weight complete hote hi WhatsApp Group + Telegram par auto message + camera photos jayega.'
            : 'OFF hai — weight complete hone par koi auto message nahi jayega.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* WhatsApp Group for VW */}
        <div className="space-y-2">
          <Label className="text-green-400 text-sm font-bold">WhatsApp Group (VW ke liye alag)</Label>
          <div className="flex gap-2">
            <Input
              value={waGroupId}
              onChange={e => setWaGroupId(e.target.value)}
              placeholder="WhatsApp Group ID"
              className="bg-slate-900 border-slate-600 text-white text-sm flex-1"
              data-testid="vw-wa-group-id"
            />
            <Button size="sm" onClick={fetchWaGroups} disabled={waGroupsLoading}
              className="bg-green-700 hover:bg-green-600 text-white text-xs" data-testid="vw-fetch-wa-groups">
              {waGroupsLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Load Groups'}
            </Button>
          </div>
          {waGroupName && <p className="text-green-400 text-xs">Selected: {waGroupName}</p>}
          {waGroups.length > 0 && (
            <div className="max-h-32 overflow-y-auto space-y-1 bg-slate-900/50 rounded p-2">
              {waGroups.map((g, i) => (
                <div key={g.id || `wa-group-${i}`}
                  className={`text-xs p-1.5 rounded cursor-pointer ${waGroupId === g.id ? 'bg-green-900/50 text-green-300 border border-green-600' : 'text-slate-300 hover:bg-slate-700'}`}
                  onClick={() => { setWaGroupId(g.id); setWaGroupName(g.name || g.id); }}
                  data-testid={`vw-wa-group-option-${i}`}>
                  {g.name || g.id}
                </div>
              ))}
            </div>
          )}
          <p className="text-slate-500 text-xs">Ye group set nahi kiya toh default WhatsApp numbers mai jayega.</p>
        </div>

        {/* Telegram Group for VW */}
        <div className="space-y-2">
          <Label className="text-blue-400 text-sm font-bold">Telegram Chat IDs (VW ke liye alag)</Label>
          {tgChatIds.length > 0 && (
            <div className="space-y-1">
              {tgChatIds.map((item, idx) => (
                <div key={`vw-tg-${item.chat_id || idx}`} className="flex items-center gap-2 bg-slate-900/50 p-2 rounded text-xs">
                  <span className="text-blue-300 flex-1">{item.name}</span>
                  <span className="text-slate-400 font-mono">{item.chat_id}</span>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400 hover:text-red-600"
                    onClick={() => removeTgChatId(idx)} data-testid={`vw-tg-remove-${idx}`}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={newTgName}
              onChange={e => setNewTgName(e.target.value)}
              placeholder="Name"
              className="bg-slate-900 border-slate-600 text-white text-sm w-1/3"
              data-testid="vw-tg-new-name"
            />
            <Input
              value={newTgChatId}
              onChange={e => setNewTgChatId(e.target.value)}
              placeholder="Chat ID (e.g. -1001234567890)"
              className="bg-slate-900 border-slate-600 text-white text-sm flex-1"
              data-testid="vw-tg-new-chatid"
            />
            <Button size="sm" onClick={addTgChatId}
              className="bg-blue-700 hover:bg-blue-600 text-white text-xs" data-testid="vw-tg-add-btn">
              <Plus className="w-3 h-3" />
            </Button>
          </div>
          <p className="text-slate-500 text-xs">Ye set nahi kiya toh default Telegram config mai jayega. Bot Token same rahega jo upar set hai.</p>
        </div>

        {/* Save Button */}
        <Button onClick={saveGroupConfig} disabled={saving}
          className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold" data-testid="vw-save-group-config">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
          Save VW Group Config
        </Button>

        <div className="bg-slate-700/50 rounded-lg p-3 border border-slate-600 text-xs text-slate-400 space-y-1">
          <p>* Jab second weight capture hota hai, auto message + camera photos jayega</p>
          <p>* WhatsApp Group set hai toh usmai jayega, nahi toh default numbers mai</p>
          <p>* Telegram Chat IDs set hai toh usmai jayega, nahi toh default config mai</p>
          <p>* Photos: 1st Weight Front/Side + 2nd Weight Front/Side (Telegram mai photo, WhatsApp mai text + photo URL)</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default MessagingTab;
ngTab;
