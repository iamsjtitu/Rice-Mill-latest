import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Keyboard, Shield, HardDrive } from "lucide-react";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";

export function ShortcutsDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-slate-800 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-amber-400 flex items-center gap-2">
            <Keyboard className="w-5 h-5" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Quick Actions (Ctrl)</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              ["Ctrl+N", "New Entry / Transaction"],
              ["Ctrl+S", "Save / Submit Form"],
              ["Ctrl+F", "Search / Filters"],
              ["Ctrl+R", "Refresh Data"],
              ["Ctrl+P", "Print"],
              ["Ctrl+Del", "Delete Selected"],
              ["Esc", "Close Dialog"],
              ["?", "Ye Shortcuts"],
            ].map(([key, desc]) => (
              <div key={key} className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-slate-700 rounded text-emerald-400 font-mono text-xs">{key}</kbd>
                <span className="text-slate-300">{desc}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider pt-2 border-t border-slate-700">Tab Navigation (Alt)</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              ["Alt+E", "Entries"],
              ["Alt+D", "Dashboard"],
              ["Alt+P", "Payments"],
              ["Alt+M", "Milling"],
              ["Alt+B", "Cash Book"],
              ["Alt+T", "DC Tracker"],
              ["Alt+O", "Reports"],
              ["Alt+G", "Vouchers"],
              ["Alt+K", "Mill Parts"],
              ["Alt+S", "Staff"],
              ["Alt+I", "Settings"],
              ["Alt+Y", "FY Summary"],
            ].map(([key, desc]) => (
              <div key={key} className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">{key}</kbd>
                <span className="text-slate-300">{desc}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider pt-2 border-t border-slate-700">Action Shortcuts (Alt+Shift)</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              ["Alt+Shift+P", "PDF Export"],
              ["Alt+Shift+E", "Excel Export"],
              ["Alt+Shift+W", "WhatsApp (copy text)"],
              ["Alt+Shift+G", "Send to Group"],
            ].map(([key, desc]) => (
              <div key={key} className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-slate-700 rounded text-cyan-400 font-mono text-xs">{key}</kbd>
                <span className="text-slate-300">{desc}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 italic pt-1">
            📌 Action shortcuts Payments (Truck / Owner / Per-Trip Bhada / Agent) aur Local Party panels me active hain. Search box pe focus hone par auto-disable ho jate hain.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BackupReminderDialog({ open, onOpenChange, onBackup, loading }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-slate-800 border-amber-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-amber-400 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Backup Reminder
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-slate-300 text-sm">
            Aaj ka backup nahi liya hai. Data ki suraksha ke liye backup lein.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={onBackup}
              disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              data-testid="backup-reminder-yes"
            >
              <HardDrive className="w-4 h-4 mr-2" />
              {loading ? 'Ho raha hai...' : 'Backup Lein'}
            </Button>
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
              data-testid="backup-reminder-skip"
            >
              Baad Mein
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PasswordChangeDialog({ open, onOpenChange, passwordData, setPasswordData, onSubmit }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-amber-400">Password Change Karein</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label className="text-slate-300">Current Password</Label>
            <Input
              type="password"
              value={passwordData.currentPassword}
              onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
              placeholder="Current password"
              className="bg-slate-700 border-slate-600 text-white"
              data-testid="current-password"
            />
          </div>
          <div>
            <Label className="text-slate-300">New Password</Label>
            <Input
              type="password"
              value={passwordData.newPassword}
              onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
              placeholder="New password (min 6 chars)"
              className="bg-slate-700 border-slate-600 text-white"
              data-testid="new-password"
            />
            <PasswordStrengthMeter password={passwordData.newPassword} />
          </div>
          <div>
            <Label className="text-slate-300">Confirm New Password</Label>
            <Input
              type="password"
              value={passwordData.confirmPassword}
              onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
              placeholder="Confirm new password"
              className="bg-slate-700 border-slate-600 text-white"
              data-testid="confirm-password"
            />
          </div>
          <div className="flex gap-3 justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold"
            >
              Change Password
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
