import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExternalLink, Plus, Trash2, Eye, EyeOff, Save } from "lucide-react";
import logger from "../../utils/logger";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

export default function GovtLinksTab() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPassIdx, setShowPassIdx] = useState(new Set());

  const fetchLinks = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/govt-links`);
      setLinks(res.data || []);
    } catch (e) { logger.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const addLink = () => {
    setLinks(prev => [...prev, { id: '', name: '', url: '', username: '', password: '', _new: true }]);
  };

  const updateField = (idx, field, value) => {
    setLinks(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value, _dirty: true } : l));
  };

  const saveAll = async () => {
    try {
      const cleaned = links.filter(l => l.name && l.url).map(l => ({
        id: l.id || undefined, name: l.name, url: l.url, username: l.username || '', password: l.password || ''
      }));
      await axios.post(`${API}/govt-links`, cleaned);
      toast.success("Govt Links saved!");
      fetchLinks();
    } catch (e) { toast.error("Save failed"); logger.error(e); }
  };

  const removeLink = (idx) => {
    setLinks(prev => prev.filter((_, i) => i !== idx));
  };

  const togglePass = (idx) => {
    setShowPassIdx(prev => {
      const n = new Set(prev);
      n.has(idx) ? n.delete(idx) : n.add(idx);
      return n;
    });
  };

  return (
    <Card className="bg-slate-800 border-slate-700" data-testid="govt-links-settings">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-amber-400 flex items-center gap-2">
          <ExternalLink className="w-5 h-5" /> Govt Useful Links
        </CardTitle>
        <div className="flex gap-2">
          <Button onClick={addLink} size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" data-testid="govt-link-add">
            <Plus className="w-4 h-4 mr-1" /> Add Link
          </Button>
          <Button onClick={saveAll} size="sm" className="bg-amber-600 hover:bg-amber-500 text-white" data-testid="govt-link-save">
            <Save className="w-4 h-4 mr-1" /> Save All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-slate-400 text-xs">Govt portals add karein — Header mein dropdown se ek click mein open honge with auto-login credentials.</p>
        {loading ? <p className="text-slate-500 text-sm">Loading...</p> : links.length === 0 ? (
          <p className="text-slate-500 text-sm py-4 text-center">Koi link nahi hai. "Add Link" se add karein.</p>
        ) : links.map((link, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 items-end bg-slate-700/50 p-3 rounded-lg border border-slate-600" data-testid={`govt-link-row-${idx}`}>
            <div className="col-span-3">
              <Label className="text-slate-300 text-[10px]">Name</Label>
              <Input value={link.name} onChange={e => updateField(idx, 'name', e.target.value)}
                placeholder="Food Portal" className="h-8 text-xs bg-slate-700 border-slate-600 text-white" data-testid={`govt-link-name-${idx}`} />
            </div>
            <div className="col-span-3">
              <Label className="text-slate-300 text-[10px]">URL</Label>
              <Input value={link.url} onChange={e => updateField(idx, 'url', e.target.value)}
                placeholder="https://portal.pdsodisha.gov.in/" className="h-8 text-xs bg-slate-700 border-slate-600 text-white" data-testid={`govt-link-url-${idx}`} />
            </div>
            <div className="col-span-2">
              <Label className="text-slate-300 text-[10px]">Username</Label>
              <Input value={link.username} onChange={e => updateField(idx, 'username', e.target.value)}
                placeholder="username" className="h-8 text-xs bg-slate-700 border-slate-600 text-white" data-testid={`govt-link-user-${idx}`} />
            </div>
            <div className="col-span-3">
              <Label className="text-slate-300 text-[10px]">Password</Label>
              <div className="flex gap-1">
                <Input type={showPassIdx.has(idx) ? 'text' : 'password'} value={link.password}
                  onChange={e => updateField(idx, 'password', e.target.value)}
                  placeholder="password" className="h-8 text-xs bg-slate-700 border-slate-600 text-white flex-1" data-testid={`govt-link-pass-${idx}`} />
                <Button variant="ghost" size="sm" onClick={() => togglePass(idx)} className="h-8 w-8 p-0 text-slate-400 hover:text-white">
                  {showPassIdx.has(idx) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
            <div className="col-span-1 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => removeLink(idx)} className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-900/30" data-testid={`govt-link-delete-${idx}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
