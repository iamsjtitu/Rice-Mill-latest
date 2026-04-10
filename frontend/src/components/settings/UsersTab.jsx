import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Key, Eye, EyeOff, Users } from "lucide-react";
import { useConfirm } from "@/components/ConfirmProvider";
import { API, ROLES, PERMISSION_DEFS, ROLE_DEFAULTS } from "./settingsConstants";

function UsersTab({ user, setUser }) {
  const showConfirm = useConfirm();
  const [users, setUsers] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({ username: "", password: "", display_name: "", role: "viewer", staff_id: "", permissions: {} });
  const [showPw, setShowPw] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${API}/users?username=${user.username}&role=${user.role}`);
      setUsers(res.data.users || []);
      setStaffList(res.data.staff || []);
    } catch { toast.error("Users load nahi ho sake"); }
  };
  useEffect(() => { fetchUsers(); }, []);

  const openAdd = () => {
    setEditingUser(null);
    setForm({ username: "", password: "", display_name: "", role: "viewer", staff_id: "", permissions: { ...ROLE_DEFAULTS.viewer } });
    setShowPw(false);
    setShowDialog(true);
  };

  const openEdit = (u) => {
    setEditingUser(u);
    setForm({
      username: u.username, password: "", display_name: u.display_name || u.username,
      role: u.role, staff_id: u.staff_id || "",
      permissions: { ...ROLE_DEFAULTS[u.role] || {}, ...u.permissions }
    });
    setShowPw(false);
    setShowDialog(true);
  };

  const handleRoleChange = (role) => {
    setForm(f => ({ ...f, role, permissions: { ...ROLE_DEFAULTS[role] || ROLE_DEFAULTS.viewer } }));
  };

  const togglePerm = (key) => {
    setForm(f => ({ ...f, permissions: { ...f.permissions, [key]: !f.permissions[key] } }));
  };

  const save = async () => {
    if (!form.username.trim()) return toast.error("Username zaruri hai");
    if (!editingUser && !form.password.trim()) return toast.error("Password zaruri hai");
    try {
      if (editingUser) {
        const userId = editingUser.id || `default_${editingUser.username}`;
        const resp = await axios.put(`${API}/users/${userId}?username=${user.username}&role=${user.role}`, form);
        toast.success("User update ho gaya");
        // If admin edited their own user, refresh permissions in App instantly
        if (editingUser.username === user.username && resp.data?.user?.permissions) {
          const updatedUser = { ...user, permissions: resp.data.user.permissions };
          sessionStorage.setItem("mill_user", JSON.stringify(updatedUser));
          setUser(updatedUser);
        }
      } else {
        await axios.post(`${API}/users?username=${user.username}&role=${user.role}`, form);
        toast.success("User ban gaya!");
      }
      setShowDialog(false);
      fetchUsers();
    } catch (e) { 
      const msg = e.response?.data?.detail || e.response?.data?.error_message || e.message || "Error";
      toast.error(msg);
    }
  };

  const deactivate = async (u) => {
    if (!await showConfirm("Deactivate", `${u.display_name || u.username} ko deactivate karein?`)) return;
    try {
      const userId = u.id || `default_${u.username}`;
      await axios.delete(`${API}/users/${userId}?username=${user.username}&role=${user.role}`);
      toast.success("User deactivate ho gaya");
      fetchUsers();
    } catch (e) { 
      const msg = e.response?.data?.detail || e.response?.data?.error_message || e.message || "Error";
      toast.error(msg);
    }
  };

  const roleLabel = (r) => ROLES.find(x => x.value === r)?.label || r;

  return (
    <div className="space-y-4" data-testid="users-tab">
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" /> Users & Permissions
            </CardTitle>
            <Button onClick={openAdd} size="sm" className="bg-amber-500 hover:bg-amber-600 text-slate-900 h-7 text-xs" data-testid="add-user-btn">
              <Plus className="w-3 h-3 mr-1" /> Add User
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="text-left py-2 px-2">User</th>
                <th className="text-left py-2 px-2">Role</th>
                <th className="text-left py-2 px-2">Permissions</th>
                <th className="text-left py-2 px-2">Staff Link</th>
                <th className="text-center py-2 px-2">Status</th>
                <th className="text-right py-2 px-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const perms = u.permissions || {};
                const linkedStaff = staffList.find(s => s.id === u.staff_id);
                return (
                  <tr key={u.id || i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="py-2 px-2">
                      <div>
                        <span className="text-slate-200 font-medium">{u.display_name || u.username}</span>
                        <span className="text-slate-500 text-[10px] ml-1">@{u.username}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        u.role === 'admin' ? 'bg-red-600/20 text-red-400' :
                        u.role === 'accountant' ? 'bg-blue-600/20 text-blue-400' :
                        u.role === 'entry_operator' ? 'bg-green-600/20 text-green-400' :
                        'bg-slate-600/30 text-slate-400'
                      }`}>{roleLabel(u.role)}</span>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex flex-wrap gap-0.5">
                        {perms.can_edit && <span className="text-[9px] bg-amber-600/20 text-amber-400 px-1 rounded">Edit</span>}
                        {perms.can_delete && <span className="text-[9px] bg-red-600/20 text-red-400 px-1 rounded">Del</span>}
                        {perms.can_export && <span className="text-[9px] bg-blue-600/20 text-blue-400 px-1 rounded">Export</span>}
                        {perms.can_see_payments && <span className="text-[9px] bg-green-600/20 text-green-400 px-1 rounded">Pay</span>}
                        {perms.can_see_cashbook && <span className="text-[9px] bg-cyan-600/20 text-cyan-400 px-1 rounded">CB</span>}
                        {perms.can_see_reports && <span className="text-[9px] bg-purple-600/20 text-purple-400 px-1 rounded">Rpt</span>}
                        {perms.can_manual_weight && <span className="text-[9px] bg-orange-600/20 text-orange-400 px-1 rounded">MnWt</span>}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-slate-400 text-[10px]">
                      {linkedStaff ? linkedStaff.name : "-"}
                    </td>
                    <td className="py-2 px-2 text-center">
                      {u.active !== false
                        ? <span className="text-[9px] bg-green-600/20 text-green-400 px-1.5 py-0.5 rounded">Active</span>
                        : <span className="text-[9px] bg-red-600/20 text-red-400 px-1.5 py-0.5 rounded">Inactive</span>}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {u.is_default ? (
                        <span className="text-[10px] text-slate-500">Default</span>
                      ) : (
                        <div className="flex gap-1 justify-end">
                          <Button onClick={() => openEdit(u)} variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400 hover:text-amber-400" data-testid={`edit-user-${u.username}`}>
                            <Key className="w-3 h-3" />
                          </Button>
                          {u.username !== 'admin' && u.active !== false && (
                            <Button onClick={() => deactivate(u)} variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400 hover:text-red-400" data-testid={`del-user-${u.username}`}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr><td colSpan={6} className="text-center py-4 text-slate-500">Koi user nahi mila</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-slate-800 border-slate-600 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">{editingUser ? "Edit User" : "New User"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-slate-400">Username</Label>
                <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  disabled={!!editingUser} placeholder="e.g. ram"
                  className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="user-form-username" />
              </div>
              <div>
                <Label className="text-[11px] text-slate-400">Display Name</Label>
                <Input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                  placeholder="e.g. Ram Kumar"
                  className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="user-form-display-name" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-slate-400">{editingUser ? "New Password (blank = no change)" : "Password"}</Label>
                <div className="relative">
                  <Input type={showPw ? "text" : "password"} value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="****"
                    className="bg-slate-700 border-slate-600 text-white h-8 text-sm pr-8" data-testid="user-form-password" />
                  <button onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1.5 text-slate-400 hover:text-white cursor-pointer">
                    {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-[11px] text-slate-400">Staff Link (Optional)</Label>
                <Select value={form.staff_id || "_none"} onValueChange={v => setForm(f => ({ ...f, staff_id: v === "_none" ? "" : v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="user-form-staff-link">
                    <SelectValue placeholder="Select Staff" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="_none" className="text-white text-xs">No Link</SelectItem>
                    {staffList.map(s => (
                      <SelectItem key={s.id} value={s.id} className="text-white text-xs">{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Role */}
            <div>
              <Label className="text-[11px] text-slate-400">Role</Label>
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                {ROLES.map(r => (
                  <button key={r.value} onClick={() => handleRoleChange(r.value)}
                    className={`text-left px-2.5 py-1.5 rounded border text-[11px] transition-colors cursor-pointer ${
                      form.role === r.value
                        ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                        : 'border-slate-600 bg-slate-700/50 text-slate-300 hover:border-slate-500'
                    }`} data-testid={`role-${r.value}`}>
                    <span className="font-bold">{r.label}</span>
                    <p className="text-[9px] text-slate-400 mt-0.5">{r.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Granular Permissions */}
            <div>
              <Label className="text-[11px] text-slate-400 mb-1.5 block">Permissions (Fine-tune)</Label>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {PERMISSION_DEFS.map(p => {
                  const isAdminLocked = form.role === 'admin' && ['can_edit', 'can_delete', 'can_edit_settings'].includes(p.key);
                  return (
                  <div key={p.key} className="flex items-center justify-between bg-slate-700/40 rounded px-2 py-1.5">
                    <div>
                      <span className="text-[11px] text-slate-200">{p.label}</span>
                      {isAdminLocked && <span className="text-[8px] text-amber-400 ml-1">(Admin)</span>}
                    </div>
                    <Switch
                      checked={isAdminLocked ? true : !!form.permissions[p.key]}
                      onCheckedChange={() => { if (!isAdminLocked) togglePerm(p.key); }}
                      disabled={isAdminLocked}
                      className="scale-75"
                      data-testid={`perm-${p.key}`}
                    />
                  </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowDialog(false)} className="border-slate-600 text-slate-300 h-8">Cancel</Button>
              <Button size="sm" onClick={save} className="bg-amber-500 hover:bg-amber-600 text-slate-900 h-8" data-testid="save-user-btn">
                {editingUser ? "Update" : "Create User"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default UsersTab;
