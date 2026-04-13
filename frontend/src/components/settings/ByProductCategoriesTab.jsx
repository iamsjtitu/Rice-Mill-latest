import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, GripVertical, Star, Pencil, Check, X } from "lucide-react";
import logger from "../../utils/logger";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

export default function ByProductCategoriesTab() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newNameHi, setNewNameHi] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editNameHi, setEditNameHi] = useState("");

  const fetchCategories = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/byproduct-categories`);
      setCategories(res.data);
    } catch (e) { logger.error(e); toast.error("Categories load nahi hui"); }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) { toast.error("Name daalo!"); return; }
    try {
      await axios.post(`${API}/byproduct-categories`, { name, name_hi: newNameHi.trim(), is_auto: false });
      toast.success(`${name} add ho gaya!`);
      setNewName(""); setNewNameHi("");
      fetchCategories();
    } catch (e) { toast.error(e.response?.data?.detail || "Add error"); }
  };

  const handleDelete = async (cat) => {
    if (!window.confirm(`"${cat.name}" delete karein? Existing milling data mein iska data rahega.`)) return;
    try {
      await axios.delete(`${API}/byproduct-categories/${cat.id}`);
      toast.success(`${cat.name} delete ho gaya!`);
      fetchCategories();
    } catch (e) { logger.error(e); toast.error("Delete error"); }
  };

  const handleSetAuto = async (cat) => {
    try {
      await axios.put(`${API}/byproduct-categories/${cat.id}`, { is_auto: true });
      toast.success(`${cat.name} ab auto-calculated hoga (100% - others)`);
      fetchCategories();
    } catch (e) { logger.error(e); toast.error("Update error"); }
  };

  const startEdit = (cat) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditNameHi(cat.name_hi || "");
  };

  const saveEdit = async () => {
    if (!editName.trim()) { toast.error("Name khali nahi ho sakta"); return; }
    try {
      await axios.put(`${API}/byproduct-categories/${editingId}`, { name: editName.trim(), name_hi: editNameHi.trim() });
      toast.success("Updated!");
      setEditingId(null);
      fetchCategories();
    } catch (e) { logger.error(e); toast.error("Update error"); }
  };

  const moveUp = async (idx) => {
    if (idx <= 0) return;
    const order = categories.map(c => c.id);
    [order[idx], order[idx - 1]] = [order[idx - 1], order[idx]];
    try {
      await axios.put(`${API}/byproduct-categories-reorder`, { order });
      fetchCategories();
    } catch (e) { logger.error(e); toast.error("Reorder error"); }
  };

  const moveDown = async (idx) => {
    if (idx >= categories.length - 1) return;
    const order = categories.map(c => c.id);
    [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
    try {
      await axios.put(`${API}/byproduct-categories-reorder`, { order });
      fetchCategories();
    } catch (e) { logger.error(e); toast.error("Reorder error"); }
  };

  if (loading) return <div className="text-center py-8 text-slate-400">Loading...</div>;

  return (
    <div className="space-y-6 mt-4" data-testid="byproduct-categories-tab">
      <div>
        <h3 className="text-lg font-bold text-amber-400">By-Product Categories</h3>
        <p className="text-xs text-slate-400 mt-1">
          Yahan se by-product categories manage karo. Ye categories Milling Form, Stock Summary, Sale Voucher - sab jagah automatically aayengi.
          Ek category ko "Auto" mark kar sakte ho - uska % baaki sab se minus hokar automatically calculate hoga.
        </p>
      </div>

      {/* Existing Categories */}
      <div className="space-y-2">
        {categories.map((cat, idx) => (
          <div key={cat.id} className="flex items-center gap-2 bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2" data-testid={`bp-cat-${cat.id}`}>
            <div className="flex flex-col gap-0.5">
              <button onClick={() => moveUp(idx)} className="text-slate-500 hover:text-slate-300 text-xs leading-none" disabled={idx === 0}>&#9650;</button>
              <button onClick={() => moveDown(idx)} className="text-slate-500 hover:text-slate-300 text-xs leading-none" disabled={idx === categories.length - 1}>&#9660;</button>
            </div>
            <GripVertical className="w-4 h-4 text-slate-500" />

            {editingId === cat.id ? (
              <>
                <Input value={editName} onChange={e => setEditName(e.target.value)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm w-32" placeholder="Name" data-testid={`bp-edit-name-${cat.id}`} />
                <Input value={editNameHi} onChange={e => setEditNameHi(e.target.value)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm w-32" placeholder="Hindi" data-testid={`bp-edit-hi-${cat.id}`} />
                <button onClick={saveEdit} className="p-1 hover:bg-green-900/30 rounded"><Check className="w-4 h-4 text-green-400" /></button>
                <button onClick={() => setEditingId(null)} className="p-1 hover:bg-red-900/30 rounded"><X className="w-4 h-4 text-red-400" /></button>
              </>
            ) : (
              <>
                <div className="flex-1">
                  <span className="text-white font-medium">{cat.name}</span>
                  {cat.name_hi && <span className="text-slate-400 text-sm ml-2">({cat.name_hi})</span>}
                </div>
                <span className="text-xs text-slate-500 font-mono">{cat.id}</span>
                {cat.is_auto ? (
                  <span className="px-2 py-0.5 rounded text-xs bg-amber-900/50 text-amber-400 font-medium">AUTO</span>
                ) : (
                  <button onClick={() => handleSetAuto(cat)} className="px-2 py-0.5 rounded text-xs bg-slate-700 text-slate-400 hover:bg-amber-900/30 hover:text-amber-400 transition" title="Set as Auto (remainder)">
                    <Star className="w-3 h-3 inline mr-1" />Auto
                  </button>
                )}
                <button onClick={() => startEdit(cat)} className="p-1 hover:bg-slate-700 rounded"><Pencil className="w-3.5 h-3.5 text-blue-400" /></button>
                <button onClick={() => handleDelete(cat)} className="p-1 hover:bg-red-900/30 rounded"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add New */}
      <div className="flex items-end gap-2 bg-slate-800/30 border border-dashed border-slate-600 rounded-lg p-3">
        <div className="flex-1">
          <label className="text-xs text-slate-400">Name (English)</label>
          <Input value={newName} onChange={e => setNewName(e.target.value)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm" placeholder="e.g. Phool" data-testid="bp-new-name" />
        </div>
        <div className="flex-1">
          <label className="text-xs text-slate-400">Name (Hindi)</label>
          <Input value={newNameHi} onChange={e => setNewNameHi(e.target.value)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm" placeholder="e.g. फूल" data-testid="bp-new-name-hi" />
        </div>
        <Button onClick={handleAdd} size="sm" className="bg-amber-600 hover:bg-amber-500 h-8" data-testid="bp-add-btn">
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>

      <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 text-xs text-blue-300">
        <strong>Note:</strong> "AUTO" category ka % baaki categories se minus hokar automatically set hota hai (100% - others = auto%).
        Naye category add karne pe wo Milling Form, Stock Summary, Sale Voucher, Excel/PDF reports - sab jagah dikhayi dega.
      </div>
    </div>
  );
}
