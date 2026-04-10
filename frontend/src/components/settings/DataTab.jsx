import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HardDrive, ShieldCheck } from "lucide-react";
import { useConfirm } from "@/components/ConfirmProvider";
import { API } from "./settingsConstants";

function DataTab({ user }) {
  const showConfirm = useConfirm();
  const [healthResult, setHealthResult] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [backups, setBackups] = useState([]);
  const [backupStatus, setBackupStatus] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);

  // Storage Engine state (read-only display)
  const [storageEngine, setStorageEngine] = useState('json');

  const fetchBackups = async () => {
    try {
      const res = await axios.get(`${API}/backups`);
      setBackups(res.data.backups || []);
      setBackupStatus(res.data);
    } catch { setBackupStatus(null); }
  };

  useEffect(() => {
    fetchBackups();
    // Load storage engine status
    axios.get(`${API}/settings/storage-engine`).then(r => {
      setStorageEngine(r.data.engine || 'json');
    }).catch(() => {});
  }, []);

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
    } catch { toast.error("Delete mein error"); }
  };

  return (
    <div className="space-y-6">
      {/* Data Health Check */}
      <Card className="bg-slate-800 border-slate-700" data-testid="data-health-section">
        <CardHeader>
          <CardTitle className="text-emerald-400 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Data Health Check / डेटा हेल्थ चेक
          </CardTitle>
          <p className="text-slate-400 text-sm">
            Auto-fix run karein - missing ledger entries, wrong accounts, orphan data sab automatically fix ho jayega.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {healthResult && (
            <div className={`p-4 rounded-lg border ${healthResult.total_fixes > 0 ? 'bg-amber-900/30 border-amber-700' : 'bg-green-900/30 border-green-700'}`}>
              <p className={`font-semibold text-sm ${healthResult.total_fixes > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                {healthResult.total_fixes > 0 ? `${healthResult.total_fixes} issues fix kiye` : 'Sab theek hai - koi issue nahi!'}
              </p>
              {healthResult.details && Object.entries(healthResult.details).map(([k, v]) =>
                v > 0 ? <p key={k} className="text-slate-400 text-xs mt-1">{k.replace(/_/g, ' ')}: {v}</p> : null
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
                } catch (e) { console.error(e); }
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
                } catch (e) { toast.error("Recalculate failed"); console.error(e); }
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

      {/* Backup Section */}
      <Card className="bg-slate-800 border-slate-700" data-testid="backup-section">
        <CardHeader>
          <CardTitle className="text-green-400 flex items-center gap-2">
            <HardDrive className="w-5 h-5" />
            Data Backup / डेटा बैकअप
          </CardTitle>
          <p className="text-slate-400 text-sm">
            Backup Now se server folder mein save hoga. ZIP Download se apne computer mein download hoga. Auto backup har din hota hai.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Backup Status */}
          {backupStatus && (
            <div className={`p-3 rounded-lg border ${backupStatus.has_today_backup ? 'bg-green-900/30 border-green-700' : 'bg-amber-900/30 border-amber-700'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`font-semibold text-sm ${backupStatus.has_today_backup ? 'text-green-400' : 'text-amber-400'}`}>
                    {backupStatus.has_today_backup ? 'Aaj ka backup hai' : 'Aaj ka backup nahi liya!'}
                  </p>
                  {backups.length > 0 && (
                    <p className="text-slate-400 text-xs mt-1">
                      Last backup: {new Date(backups[0].created_at).toLocaleString('en-IN')} ({backups[0].size_readable})
                    </p>
                  )}
                </div>
                <p className="text-slate-400 text-sm">{backups.length} / {backupStatus.max_backups} backups</p>
              </div>
            </div>
          )}

          {/* Custom Backup Folder */}
          <div className="p-3 bg-slate-700/40 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-3">
                <p className="text-sm text-white font-medium">Backup Folder / बैकअप फोल्डर</p>
                {backupStatus?.custom_backup_dir ? (
                  <div className="mt-1 p-1.5 bg-green-900/30 border border-green-700/50 rounded text-[11px] text-green-300 font-mono break-all">
                    {backupStatus.custom_backup_dir}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-1">Default folder (data folder ke andar)</p>
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
                  variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700 h-7 text-xs"
                  data-testid="select-backup-folder-btn"
                >
                  <HardDrive className="w-3.5 h-3.5 mr-1" /> Select Drive
                </Button>
                {backupStatus?.custom_backup_dir && (
                  <Button 
                    onClick={async () => {
                      await axios.put(`${API}/backups/custom-dir`, { dir: null });
                      toast.success("Default folder set");
                      fetchBackups();
                    }}
                    variant="ghost" size="sm" className="text-red-400 hover:text-red-300 h-7 text-xs"
                    data-testid="reset-backup-folder-btn"
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
            <p className="text-[10px] text-amber-400">Logout par auto backup + manual backup dono is folder mein save honge</p>
          </div>

          {/* Backup Now */}
          <Button
            onClick={handleCreateBackup} disabled={backupLoading}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold"
            data-testid="create-backup-btn"
          >
            {backupLoading ? 'Backup ho raha hai...' : 'Backup Now / अभी बैकअप लें'}
          </Button>

          {/* Saved Backups */}
          {backups.length > 0 && (
            <div className="space-y-2">
              <p className="text-slate-300 text-sm font-semibold">Saved Backups (Last {backupStatus?.max_backups || 7}):</p>
              {backups.map((b) => (
                <div key={b.filename} className="flex items-center justify-between bg-slate-700/50 p-3 rounded-lg border border-slate-600" data-testid={`backup-item-${b.filename}`}>
                  <div>
                    <p className="text-white text-sm font-mono">{b.filename}</p>
                    <p className="text-slate-400 text-xs">
                      {new Date(b.created_at).toLocaleString('en-IN')} | {b.size_readable}
                      {b.source === 'custom' && <span className="ml-1 text-amber-400">(Custom Drive)</span>}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleRestoreBackup(b.filename, b.custom_dir)} disabled={backupLoading} className="text-blue-400 border-blue-600 hover:bg-blue-900/30 text-xs" data-testid={`restore-btn-${b.filename}`}>Restore</Button>
                    <Button size="sm" variant="outline" onClick={() => handleDeleteBackup(b.filename)} className="text-red-400 border-red-600 hover:bg-red-900/30 text-xs" data-testid={`delete-backup-btn-${b.filename}`}>Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ZIP Download */}
          <div className="border border-slate-600 rounded-lg p-4 bg-slate-900/50">
            <p className="text-slate-300 text-sm font-semibold mb-2">ZIP Download / ज़िप डाउनलोड</p>
            <p className="text-slate-500 text-xs mb-3">Computer mein ZIP file download hogi - email ya drive mein share kar sakte hain.</p>
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
              className="w-full border-green-600 text-green-400 hover:bg-green-900/30 font-semibold"
              data-testid="download-backup-btn"
            >
              {backupLoading ? 'Downloading...' : 'Download ZIP / ज़िप डाउनलोड'}
            </Button>
          </div>

          {/* ZIP Restore */}
          <div className="border border-slate-600 rounded-lg p-4 bg-slate-900/50">
            <p className="text-slate-300 text-sm font-semibold mb-2">Backup Upload & Restore</p>
            <p className="text-red-400 text-xs mb-3">Warning: Current data replace ho jayega! Pehle backup le lein.</p>
            <div className="flex gap-2">
              {/* ZIP Upload */}
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
                className="flex-1 border-amber-600 text-amber-400 hover:bg-amber-900/30 text-xs"
                data-testid="restore-backup-btn"
              >
                {backupLoading ? 'Restoring...' : 'ZIP Upload & Restore'}
              </Button>

              {/* JSON Upload */}
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
                className="flex-1 border-blue-600 text-blue-400 hover:bg-blue-900/30 text-xs"
                data-testid="restore-json-backup-btn"
              >
                {backupLoading ? 'Restoring...' : 'JSON Upload & Restore'}
              </Button>
            </div>
          </div>

          <div className="text-center text-slate-500 text-xs">
            <p>Auto Backup: Har din automatically hota hai | Max {backupStatus?.max_backups || 7} backups save hote hain | Location: data/backups/</p>
          </div>
        </CardContent>
      </Card>

      {/* Storage Engine Card */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-amber-400 text-base flex items-center gap-2">
            <HardDrive className="w-4 h-4" />
            Storage Engine
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-300 text-sm font-medium">
            Current: <span className={storageEngine === 'sqlite' ? 'text-green-400 font-bold' : storageEngine === 'mongodb' ? 'text-blue-400 font-bold' : 'text-amber-400 font-bold'}>
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
