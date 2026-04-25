import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HardDrive, ShieldCheck, LogOut, Clock, Hand, Trash2, Download, Upload, AlertTriangle, CalendarClock, Lock, KeyRound } from "lucide-react";
import { useConfirm } from "@/components/ConfirmProvider";
import { API } from "./settingsConstants";
import logger from "../../utils/logger";

function DataTab({ user }) {
  const showConfirm = useConfirm();
  const [healthResult, setHealthResult] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [backups, setBackups] = useState([]);
  const [backupStatus, setBackupStatus] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [autoDelete, setAutoDelete] = useState({ enabled: false, days: 7 });
  const [schedule, setSchedule] = useState({ hour: 0, enabled: true });
  const [encryption, setEncryption] = useState({ enabled: false, can_enable: false, license_present: false, encrypted_count: 0, plain_count: 0, reason: '' });
  const [storageEngine, setStorageEngine] = useState('json');

  const fetchBackups = async () => {
    try {
      const res = await axios.get(`${API}/backups`);
      setBackups(res.data.backups || []);
      setBackupStatus(res.data);
    } catch (e) { setBackupStatus(null); }
  };

  const fetchAutoDelete = async () => {
    try {
      const res = await axios.get(`${API}/backups/auto-delete`);
      setAutoDelete({ enabled: !!res.data.enabled, days: res.data.days || 7 });
    } catch (e) { /* endpoint optional */ }
  };

  const fetchSchedule = async () => {
    try {
      const res = await axios.get(`${API}/backups/schedule`);
      setSchedule({
        hour: Number.isInteger(res.data.hour) ? res.data.hour : 0,
        enabled: res.data.enabled !== false,
      });
    } catch (e) { /* endpoint optional / web version */ }
  };

  const fetchEncryption = async () => {
    try {
      const res = await axios.get(`${API}/backups/encryption`);
      setEncryption({
        enabled: !!res.data.enabled,
        can_enable: !!res.data.can_enable,
        license_present: !!res.data.license_present,
        encrypted_count: res.data.encrypted_count || 0,
        plain_count: res.data.plain_count || 0,
        reason: res.data.reason || '',
      });
    } catch (e) { /* web version doesn't have backups */ }
  };

  useEffect(() => {
    fetchBackups();
    fetchAutoDelete();
    fetchSchedule();
    fetchEncryption();
    axios.get(`${API}/settings/storage-engine`).then(r => {
      setStorageEngine(r.data.engine || 'json');
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await axios.post(`${API}/backups`);
      toast.success(res.data.message || "Backup ban gaya!");
      fetchBackups();
    } catch (e) { toast.error("Backup mein error: " + (e.response?.data?.detail || e.message)); }
    setBackupLoading(false);
  };

  const handleRestoreBackup = async (filename, sourceDir) => {
    const ok = await showConfirm("Restore Backup", `Kya aap "${filename}" se data restore karna chahte hain? Current data replace ho jaayega.`);
    if (!ok) return;
    setBackupLoading(true);
    try {
      const res = await axios.post(`${API}/backups/restore`, { filename, source_dir: sourceDir || null });
      toast.success(res.data.message || "Restore ho gaya!");
      window.location.reload();
    } catch (e) { toast.error("Restore mein error: " + (e.response?.data?.detail || e.message)); }
    setBackupLoading(false);
  };

  const handleDeleteBackup = async (filename) => {
    const ok = await showConfirm("Delete Backup", `Kya aap "${filename}" backup delete karna chahte hain?`);
    if (!ok) return;
    try {
      await axios.delete(`${API}/backups/${filename}`);
      toast.success("Backup delete ho gaya");
      fetchBackups();
    } catch (e) { logger.error(e); toast.error("Delete mein error"); }
  };

  const handleBulkDeleteSection = async (source, label) => {
    const ok = await showConfirm(`Delete All ${label} Backups`, `Kya aap saari ${label} backups delete karna chahte hain?`);
    if (!ok) return;
    try {
      const res = await axios.post(`${API}/backups/bulk-delete`, { source });
      toast.success(`${res.data.deleted} ${label} backups delete ho gaye`);
      fetchBackups();
    } catch (e) { logger.error(e); toast.error("Bulk delete mein error"); }
  };

  const handleCleanupOld = async () => {
    const ok = await showConfirm("Cleanup Old Backups", `${autoDelete.days} din se purani saari backups delete kar di jayengi. Kya aap sure hain?`);
    if (!ok) return;
    try {
      const res = await axios.post(`${API}/backups/cleanup-old`, { days: autoDelete.days });
      toast.success(`${res.data.deleted} purani backups delete ho gayi`);
      fetchBackups();
    } catch (e) { logger.error(e); toast.error("Cleanup error"); }
  };

  const updateAutoDelete = async (enabled, days) => {
    try {
      const res = await axios.put(`${API}/backups/auto-delete`, { enabled, days });
      setAutoDelete({ enabled: !!res.data.enabled, days: res.data.days || 7 });
      toast.success(`Auto-delete ${enabled ? 'enabled' : 'disabled'}`);
    } catch (e) { logger.error(e); toast.error("Settings save error"); }
  };

  const updateSchedule = async (hour, enabled) => {
    try {
      const res = await axios.put(`${API}/backups/schedule`, { hour, enabled });
      setSchedule({
        hour: Number.isInteger(res.data.hour) ? res.data.hour : 0,
        enabled: res.data.enabled !== false,
      });
      toast.success(`Schedule saved · daily backup ${enabled ? `at ${String(hour).padStart(2, '0')}:00` : 'disabled'}`);
    } catch (e) { logger.error(e); toast.error("Schedule save error (web version pe support nahi)"); }
  };

  const updateEncryption = async (enabled) => {
    if (enabled) {
      const ok = await showConfirm(
        'Enable Backup Encryption',
        'New backups ab AES-256-GCM se encrypt ho jayengi (license key se derive). ⚠ IMPORTANT: agar license change ho jaye toh purani encrypted backups restore nahi hongi. Apni license key safe rakhein. Continue?'
      );
      if (!ok) return;
    }
    try {
      const res = await axios.put(`${API}/backups/encryption`, { enabled });
      setEncryption(prev => ({ ...prev, enabled: !!res.data.enabled }));
      // Refresh counts
      fetchEncryption();
      toast.success(`Backup encryption ${res.data.enabled ? 'ENABLED' : 'disabled'}`);
    } catch (e) {
      logger.error(e);
      toast.error(e.response?.data?.detail || 'Encryption setting save fail');
    }
  };

  // Total backup size + warning threshold (100MB)
  const totalSizeBytes = useMemo(() => {
    if (backupStatus?.total_size_bytes !== undefined) return backupStatus.total_size_bytes;
    return backups.reduce((s, b) => s + (Number(b.size) || 0), 0);
  }, [backups, backupStatus]);
  const totalSizeReadable = useMemo(() => {
    if (backupStatus?.total_size_readable) return backupStatus.total_size_readable;
    if (totalSizeBytes >= 1024 * 1024) return (totalSizeBytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (totalSizeBytes / 1024).toFixed(1) + ' KB';
  }, [totalSizeBytes, backupStatus]);
  const isOverThreshold = totalSizeBytes >= 100 * 1024 * 1024; // 100 MB

  // Categorize backups by source (filename prefix) and filter to last 7 days
  const categorized = useMemo(() => {
    const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recent = backups.filter(b => new Date(b.created_at).getTime() >= cutoff);
    const groups = { logout: [], auto: [], manual: [] };
    recent.forEach(b => {
      const f = b.filename || '';
      if (f.startsWith('backup_logout')) groups.logout.push(b);
      else if (f.startsWith('backup_manual')) groups.manual.push(b);
      else if (!f.startsWith('backup_pre-')) groups.auto.push(b); // skip pre-restore safety backups
    });
    return groups;
  }, [backups]);

  // White-theme stacked backup table — full width, clear fonts
  const BackupTable = ({ sectionKey, label, accentColor, icon: Icon, items }) => (
    <div className="bg-white border-2 border-slate-200 rounded-xl shadow-sm overflow-hidden" data-testid={`backup-section-${sectionKey}`}>
      {/* Section header bar */}
      <div className={`flex items-center justify-between px-5 py-3 border-b-2 ${accentColor.headerBg} ${accentColor.headerBorder}`}>
        <div className={`flex items-center gap-2.5 ${accentColor.headerText} font-bold text-base`}>
          <Icon className="w-5 h-5" />
          <span>{label} Backups</span>
          <span className="ml-2 px-2.5 py-0.5 bg-white border border-current rounded-full text-sm font-semibold">{items.length}</span>
        </div>
        {items.length > 0 && (
          <Button
            size="sm" variant="outline"
            className="h-8 border-2 border-red-300 text-red-700 hover:bg-red-50 hover:border-red-400 font-semibold text-sm"
            onClick={() => handleBulkDeleteSection(sectionKey, label)}
            data-testid={`bulk-delete-${sectionKey}-btn`}
          >
            <Trash2 className="w-4 h-4 mr-1.5" /> Delete All
          </Button>
        )}
      </div>

      {/* Table body */}
      {items.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-slate-500 text-sm font-medium">Koi {label.toLowerCase()} backup nahi hai</p>
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto" data-testid={`backup-list-${sectionKey}`}>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-2.5 font-semibold text-slate-700 text-xs uppercase tracking-wider">File Name</th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-700 text-xs uppercase tracking-wider">Date / Time</th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-700 text-xs uppercase tracking-wider">Size</th>
                <th className="text-right px-5 py-2.5 font-semibold text-slate-700 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b, idx) => (
                <tr
                  key={b.filename}
                  className={`border-b border-slate-100 hover:bg-slate-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                  data-testid={`backup-item-${b.filename}`}
                >
                  <td className="px-5 py-2.5 font-mono text-xs text-slate-800 max-w-md truncate">{b.filename}</td>
                  <td className="px-3 py-2.5 text-slate-700 text-xs whitespace-nowrap">{new Date(b.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td className="px-3 py-2.5 text-slate-700 text-xs whitespace-nowrap">
                    {b.size_readable}
                    {b.source === 'custom' && <span className="ml-1.5 px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-semibold">Custom Drive</span>}
                  </td>
                  <td className="px-5 py-2.5 text-right whitespace-nowrap">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => handleRestoreBackup(b.filename, b.custom_dir)} disabled={backupLoading} className="h-7 px-2.5 text-xs border-blue-300 text-blue-700 hover:bg-blue-50" data-testid={`restore-btn-${b.filename}`}>Restore</Button>
                      <Button size="sm" variant="outline" onClick={() => handleDeleteBackup(b.filename)} className="h-7 px-2.5 text-xs border-red-300 text-red-700 hover:bg-red-50" data-testid={`delete-backup-btn-${b.filename}`}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ===== Data Health Check ===== */}
      <Card className="bg-white border-2 border-slate-200 shadow-sm" data-testid="data-health-section">
        <CardHeader className="border-b border-slate-200 bg-emerald-50/40">
          <CardTitle className="text-emerald-700 flex items-center gap-2 text-lg font-bold">
            <ShieldCheck className="w-5 h-5" />
            Data Health Check / डेटा हेल्थ चेक
          </CardTitle>
          <p className="text-slate-600 text-sm">
            Auto-fix run karein - missing ledger entries, wrong accounts, orphan data sab automatically fix ho jayega.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {healthResult && (
            <div className={`p-4 rounded-lg border-2 ${healthResult.total_fixes > 0 ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'}`}>
              <p className={`font-bold text-sm ${healthResult.total_fixes > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
                {healthResult.total_fixes > 0 ? `${healthResult.total_fixes} issues fix kiye` : 'Sab theek hai - koi issue nahi!'}
              </p>
              {healthResult.details && Object.entries(healthResult.details).map(([k, v]) =>
                v > 0 ? <p key={k} className="text-slate-700 text-xs mt-1">{k.replace(/_/g, ' ')}: {v}</p> : null
              )}
              {healthResult.ran_at && <p className="text-slate-500 text-xs mt-2">Last run: {new Date(healthResult.ran_at).toLocaleString('en-IN')}</p>}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                try {
                  setHealthLoading(true);
                  const res = await axios.post(`${API}/cash-book/auto-fix`);
                  setHealthResult({ ...res.data, ran_at: new Date().toISOString() });
                } catch (e) { logger.error(e); }
                finally { setHealthLoading(false); }
              }}
              disabled={healthLoading}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              data-testid="run-health-check-btn"
            >
              {healthLoading ? 'Checking...' : 'Run Health Check'}
            </Button>
            <Button
              onClick={async () => {
                try {
                  setHealthLoading(true);
                  const res = await axios.post(`${API}/entries/recalculate-all?username=${user.username}&role=${user.role}`);
                  toast.success(`${res.data.updated} entries recalculate kiye (Total: ${res.data.total})`);
                } catch (e) { toast.error("Recalculate failed"); logger.error(e); }
                finally { setHealthLoading(false); }
              }}
              disabled={healthLoading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              data-testid="recalculate-entries-btn"
            >
              {healthLoading ? 'Recalculating...' : 'Recalculate Entries'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ===== Data Backup Section ===== */}
      <Card className="bg-white border-2 border-slate-200 shadow-sm" data-testid="backup-section">
        <CardHeader className="border-b border-slate-200 bg-emerald-50/40">
          <CardTitle className="text-emerald-700 flex items-center gap-2 text-lg font-bold">
            <HardDrive className="w-5 h-5" />
            Data Backup / डेटा बैकअप
          </CardTitle>
          <p className="text-slate-600 text-sm">
            Last 7 din ki backups dikhayi gayi hain. Logout / Automatic / Manual — alag alag tables mein.
          </p>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          {/* === Backup Status Banner === */}
          {backupStatus && (
            <div className={`p-4 rounded-lg border-2 ${backupStatus.has_today_backup ? 'bg-emerald-50 border-emerald-300' : 'bg-amber-50 border-amber-300'}`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className={`font-bold text-base ${backupStatus.has_today_backup ? 'text-emerald-800' : 'text-amber-800'}`}>
                    {backupStatus.has_today_backup ? '✓ Aaj ka backup hai' : '⚠ Aaj ka backup nahi liya!'}
                  </p>
                  {backups.length > 0 && (
                    <p className="text-slate-700 text-xs mt-1">
                      Last backup: <span className="font-semibold">{new Date(backups[0].created_at).toLocaleString('en-IN')}</span> ({backups[0].size_readable})
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-slate-700 text-sm font-medium">{backups.length} total / Last 7 days</p>
                  <p className="text-slate-600 text-xs mt-0.5" data-testid="total-backup-size">
                    Total size: <span className={`font-bold ${isOverThreshold ? 'text-red-700' : 'text-slate-800'}`}>{totalSizeReadable}</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* === 100MB Warning Banner === */}
          {isOverThreshold && (
            <div className="p-4 rounded-lg border-2 bg-red-50 border-red-300 flex items-start gap-3" data-testid="size-warning-banner">
              <AlertTriangle className="w-5 h-5 text-red-700 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <p className="font-bold text-red-800">Backup folder 100 MB se zyada ho gaya hai ({totalSizeReadable})</p>
                <p className="text-red-700 text-xs mt-1">
                  Disk space bachane ke liye purani backups delete karein — niche "Run Cleanup Now" button ya kisi section ke "Delete All" ka use karein.
                </p>
              </div>
            </div>
          )}

          {/* === Backup Folder === */}
          <div className="bg-slate-50 border-2 border-slate-200 rounded-lg p-4">
            <p className="text-slate-800 text-sm font-bold mb-2.5">Backup Folder / बैकअप फोल्डर</p>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                {backupStatus?.custom_backup_dir ? (
                  <div className="px-3 py-2 bg-emerald-50 border-2 border-emerald-200 rounded-md text-xs text-emerald-900 font-mono break-all">
                    {backupStatus.custom_backup_dir}
                  </div>
                ) : (
                  <div className="px-3 py-2 bg-white border border-slate-200 rounded-md text-xs text-slate-600">
                    Default folder (Data folder ke andar)
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    try {
                      const res = await axios.post(`${API}/backups/browse-folder`);
                      if (res.data.success && res.data.dir) {
                        await axios.put(`${API}/backups/custom-dir`, { dir: res.data.dir });
                        toast.success(`Backup folder: ${res.data.dir}`);
                        fetchBackups();
                      }
                    } catch (e) {
                      if (e.response?.status === 500 && e.response?.data?.detail?.includes('electron')) {
                        toast.error("Ye feature sirf Desktop App mein kaam karega");
                      } else {
                        toast.error("Folder select error");
                      }
                    }
                  }}
                  variant="outline" size="sm" className="border-2 border-slate-300 text-slate-700 hover:bg-white h-9 text-sm font-semibold"
                  data-testid="select-backup-folder-btn"
                >
                  <HardDrive className="w-4 h-4 mr-1.5" /> Select Drive
                </Button>
                {backupStatus?.custom_backup_dir && (
                  <Button
                    onClick={async () => {
                      await axios.put(`${API}/backups/custom-dir`, { dir: null });
                      toast.success("Default folder set");
                      fetchBackups();
                    }}
                    variant="outline" size="sm" className="border-2 border-red-300 text-red-700 hover:bg-red-50 h-9 text-sm font-semibold"
                    data-testid="reset-backup-folder-btn"
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* === Backup Encryption Settings === */}
          <div
            className={`border-2 rounded-lg p-4 ${encryption.enabled ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'}`}
            data-testid="backup-encryption-section"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className={`p-2 rounded-md ${encryption.enabled ? 'bg-emerald-100' : 'bg-slate-200'}`}>
                  {encryption.enabled
                    ? <Lock className="w-5 h-5 text-emerald-700" />
                    : <KeyRound className="w-5 h-5 text-slate-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${encryption.enabled ? 'text-emerald-800' : 'text-slate-800'}`}>
                    Backup Encryption (AES-256-GCM)
                    {encryption.enabled && <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-xs font-semibold border border-emerald-300">ON</span>}
                  </p>
                  <p className="text-slate-700 text-xs mt-1">
                    {encryption.enabled
                      ? 'New backups encrypted hote hain — license key ke bina restore nahi ho sakti. Disk leak / chori se data safe.'
                      : 'Plain JSON backups ban rahi hain. Enable karne par naye backups license-key se encrypt honge.'}
                  </p>
                  {(encryption.encrypted_count > 0 || encryption.plain_count > 0) && (
                    <p className="text-slate-600 text-xs mt-1.5" data-testid="encryption-counts">
                      Current backups: <span className="font-semibold text-emerald-700">{encryption.encrypted_count} encrypted</span>
                      <span className="mx-1.5 text-slate-400">·</span>
                      <span className="font-semibold text-slate-700">{encryption.plain_count} plain</span>
                    </p>
                  )}
                  {!encryption.can_enable && encryption.reason && (
                    <p className="text-amber-700 text-xs mt-2 flex items-start gap-1.5" data-testid="encryption-disabled-reason">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>{encryption.reason}</span>
                    </p>
                  )}
                  {!encryption.can_enable && !encryption.reason && (
                    <p className="text-amber-700 text-xs mt-2 flex items-start gap-1.5" data-testid="encryption-no-license">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>License activate karein pehle — encryption ke liye license key required hai.</span>
                    </p>
                  )}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  checked={encryption.enabled}
                  disabled={!encryption.can_enable && !encryption.enabled}
                  onChange={e => updateEncryption(e.target.checked)}
                  className="w-5 h-5 accent-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="encryption-toggle"
                />
                <span className={`text-sm font-bold ${encryption.enabled ? 'text-emerald-700' : 'text-slate-700'} ${(!encryption.can_enable && !encryption.enabled) ? 'opacity-50' : ''}`}>
                  {encryption.enabled ? 'Encrypted' : 'Encrypt new backups'}
                </span>
              </label>
            </div>
            {encryption.enabled && (
              <div className="mt-3 pt-3 border-t border-emerald-200 text-xs text-emerald-900 bg-white/60 rounded p-2.5 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-700" />
                <p>
                  <span className="font-bold">Important:</span> Apni license key safe rakhein. Agar license key kho jaye ya badal jaye, encrypted backups restore nahi hongi. Safety ke liye license activation cache ko bhi (Settings → License) backup karte rahein.
                </p>
              </div>
            )}
          </div>

          {/* === Backup Schedule Settings === */}
          <div className="bg-slate-50 border-2 border-slate-200 rounded-lg p-4 flex flex-wrap items-center gap-3" data-testid="backup-schedule-section">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={schedule.enabled}
                onChange={e => updateSchedule(schedule.hour, e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
                data-testid="schedule-enabled-toggle"
              />
              <CalendarClock className="w-4 h-4 text-slate-600" />
              Daily auto-backup at
            </label>
            <select
              value={schedule.hour}
              onChange={e => updateSchedule(parseInt(e.target.value, 10), schedule.enabled)}
              disabled={!schedule.enabled}
              className="bg-white border-2 border-slate-300 text-slate-900 rounded-md h-8 px-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="schedule-hour-select"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00 ({h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`})
                </option>
              ))}
            </select>
            <span className="text-slate-500 text-xs italic">
              {schedule.enabled
                ? `Aaj ${String(schedule.hour).padStart(2, '0')}:00 ke baad backup automatic ban jayega (agar abhi tak nahi bana)`
                : 'Scheduled backup disabled — sirf logout aur manual backup hi banenge'}
            </span>
          </div>

          {/* === Auto-Delete Settings === */}
          <div className="bg-slate-50 border-2 border-slate-200 rounded-lg p-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 cursor-pointer" data-testid="auto-delete-toggle-label">
              <input
                type="checkbox"
                checked={autoDelete.enabled}
                onChange={e => updateAutoDelete(e.target.checked, autoDelete.days)}
                className="w-4 h-4 accent-emerald-600"
                data-testid="auto-delete-toggle"
              />
              Auto-delete backups older than
            </label>
            <input
              type="number" min="1" max="90"
              value={autoDelete.days}
              onChange={e => setAutoDelete(p => ({ ...p, days: parseInt(e.target.value, 10) || 7 }))}
              onBlur={() => updateAutoDelete(autoDelete.enabled, autoDelete.days)}
              className="bg-white border-2 border-slate-300 text-slate-900 rounded-md h-8 px-2 text-sm w-16 font-semibold"
              data-testid="auto-delete-days-input"
            />
            <span className="text-slate-700 text-sm font-medium">days</span>
            <Button
              onClick={handleCleanupOld} variant="outline" size="sm"
              className="ml-auto border-2 border-red-300 text-red-700 hover:bg-red-50 h-8 text-xs font-semibold"
              data-testid="cleanup-old-btn"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Run Cleanup Now
            </Button>
          </div>

          {/* === Backup Now Button === */}
          <Button
            onClick={handleCreateBackup} disabled={backupLoading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 text-base shadow-sm"
            data-testid="create-backup-btn"
          >
            {backupLoading ? 'Backup ho raha hai...' : 'Backup Now / अभी बैकअप लें'}
          </Button>

          {/* ===== STACKED VERTICAL BACKUP TABLES ===== */}
          {/* 1. Logout Backups (Top) */}
          <BackupTable
            sectionKey="logout"
            label="Logout"
            accentColor={{ headerBg: 'bg-red-50', headerBorder: 'border-red-200', headerText: 'text-red-800' }}
            icon={LogOut}
            items={categorized.logout}
          />

          {/* 2. Automatic Backups (Middle) */}
          <BackupTable
            sectionKey="auto"
            label="Automatic"
            accentColor={{ headerBg: 'bg-blue-50', headerBorder: 'border-blue-200', headerText: 'text-blue-800' }}
            icon={Clock}
            items={categorized.auto}
          />

          {/* 3. Manual Backups (Bottom) */}
          <BackupTable
            sectionKey="manual"
            label="Manual"
            accentColor={{ headerBg: 'bg-emerald-50', headerBorder: 'border-emerald-200', headerText: 'text-emerald-800' }}
            icon={Hand}
            items={categorized.manual}
          />

          {/* === ZIP Download === */}
          <div className="bg-slate-50 border-2 border-slate-200 rounded-lg p-4">
            <p className="text-slate-800 text-sm font-bold mb-1">ZIP Download / ज़िप डाउनलोड</p>
            <p className="text-slate-600 text-xs mb-3">Computer mein ZIP file download hogi - email ya drive mein share kar sakte hain.</p>
            <Button
              onClick={async () => {
                try {
                  setBackupLoading(true);
                  const response = await fetch(`${API}/backup/download?username=${user.username}&role=${user.role}`);
                  if (!response.ok) throw new Error("Download fail");
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `mill_backup_${new Date().toISOString().slice(0, 10)}.zip`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  setTimeout(() => window.URL.revokeObjectURL(url), 30000);
                  toast.success("Backup ZIP download ho gaya!");
                } catch (e) { toast.error("Download fail: " + e.message); }
                finally { setBackupLoading(false); }
              }}
              disabled={backupLoading} variant="outline"
              className="w-full border-2 border-emerald-400 text-emerald-700 hover:bg-emerald-50 font-semibold h-10"
              data-testid="download-backup-btn"
            >
              <Download className="w-4 h-4 mr-2" />
              {backupLoading ? 'Downloading...' : 'Download ZIP / ज़िप डाउनलोड'}
            </Button>
          </div>

          {/* === Restore (ZIP / JSON) === */}
          <div className="bg-slate-50 border-2 border-slate-200 rounded-lg p-4">
            <p className="text-slate-800 text-sm font-bold mb-1">Backup Upload & Restore</p>
            <p className="text-red-700 text-xs mb-3 font-medium">⚠ Warning: Current data replace ho jayega! Pehle backup le lein.</p>
            <div className="flex gap-2 flex-wrap">
              <input
                type="file" accept=".zip" id="backup-restore-input" className="hidden"
                data-testid="restore-file-input"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (!file.name.endsWith('.zip')) { toast.error("Sirf ZIP file upload karein"); return; }
                  if (!await showConfirm("Restore Data", "Kya aap sure hain? Current data replace ho jayega!")) { e.target.value = ''; return; }
                  try {
                    setBackupLoading(true);
                    const formData = new FormData();
                    formData.append('file', file);
                    const res = await axios.post(`${API}/backup/restore?username=${user.username}&role=${user.role}`, formData, {
                      headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    toast.success(res.data.message || "Restore ho gaya!");
                  } catch (err) { toast.error(err.response?.data?.detail || "Restore fail!"); }
                  finally { setBackupLoading(false); e.target.value = ''; }
                }}
              />
              <Button
                onClick={() => document.getElementById('backup-restore-input')?.click()}
                disabled={backupLoading} variant="outline"
                className="flex-1 min-w-[180px] border-2 border-amber-400 text-amber-800 hover:bg-amber-50 text-sm font-semibold h-10"
                data-testid="restore-backup-btn"
              >
                <Upload className="w-4 h-4 mr-2" />
                {backupLoading ? 'Restoring...' : 'ZIP Upload & Restore'}
              </Button>

              <input
                type="file" accept=".json" id="backup-json-restore-input" className="hidden"
                data-testid="restore-json-file-input"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (!file.name.endsWith('.json')) { toast.error("Sirf JSON file upload karein"); return; }
                  if (!await showConfirm("Restore Data", "Kya aap sure hain? JSON backup se data replace ho jayega!")) { e.target.value = ''; return; }
                  try {
                    setBackupLoading(true);
                    const text = await file.text();
                    JSON.parse(text); // Validate
                    const res = await axios.post(`${API}/backups/restore-json`, { data: text, filename: file.name });
                    toast.success(res.data.message || "Restore ho gaya!");
                    window.location.reload();
                  } catch (err) { toast.error(err.response?.data?.detail || err.message || "JSON Restore fail!"); }
                  finally { setBackupLoading(false); e.target.value = ''; }
                }}
              />
              <Button
                onClick={() => document.getElementById('backup-json-restore-input')?.click()}
                disabled={backupLoading} variant="outline"
                className="flex-1 min-w-[180px] border-2 border-blue-400 text-blue-800 hover:bg-blue-50 text-sm font-semibold h-10"
                data-testid="restore-json-backup-btn"
              >
                <Upload className="w-4 h-4 mr-2" />
                {backupLoading ? 'Restoring...' : 'JSON Upload & Restore'}
              </Button>
            </div>
          </div>

          <div className="text-center text-slate-500 text-xs pt-1">
            <p>Auto Backup: Daily scheduled time pe | Logout par bhi auto backup | Last 7 days dikhaye gaye hain</p>
          </div>
        </CardContent>
      </Card>

      {/* ===== Storage Engine ===== */}
      <Card className="bg-white border-2 border-slate-200 shadow-sm">
        <CardHeader className="pb-3 border-b border-slate-200 bg-amber-50/40">
          <CardTitle className="text-amber-700 text-base flex items-center gap-2 font-bold">
            <HardDrive className="w-4 h-4" />
            Storage Engine
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <p className="text-slate-700 text-sm font-medium">
            Current: <span className={storageEngine === 'sqlite' ? 'text-emerald-700 font-bold' : storageEngine === 'mongodb' ? 'text-blue-700 font-bold' : 'text-amber-700 font-bold'}>
              {storageEngine === 'sqlite' ? 'SQLite (WAL Mode)' : storageEngine === 'mongodb' ? 'MongoDB' : 'JSON (Fallback)'}
            </span>
          </p>
          <p className="text-slate-500 text-xs mt-1">
            {storageEngine === 'sqlite'
              ? 'Crash-safe, fast saves, 1 Lakh+ entries support'
              : storageEngine === 'mongodb'
              ? 'Web version - Cloud database'
              : 'Fallback mode - better-sqlite3 install karein for best performance'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default DataTab;
