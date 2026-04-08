import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  FileSpreadsheet, FileText, BarChart3, TrendingUp, Truck,
  Users, IndianRupee, Key, Wheat, Wallet, Package, UserCheck,
  Menu, X
} from "lucide-react";

export function TabNavigation({ activeTab, setActiveTabSafe, user }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const perms = user.permissions || {};
  const isAdmin = user.role === 'admin';

  const tabs = [
    { id: "entries", label: "Entries", icon: FileSpreadsheet },
    { id: "dashboard", label: "Dashboard & Targets", icon: BarChart3 },
    { id: "milling", label: "Milling (CMR)", icon: Wheat },
    { id: "dctracker", label: "DC (Payments)", icon: Truck },
    { id: "vouchers", label: "Vouchers", icon: FileText },
    { id: "cashbook", label: "Cash Book & Ledgers", icon: Wallet, perm: "can_see_cashbook" },
    { id: "payments", label: "Payments", icon: IndianRupee, perm: "can_see_payments" },
    { id: "reports", label: "Reports", icon: BarChart3, perm: "can_see_reports" },
    { id: "mill-parts", label: "Mill Parts", icon: Package },
    { id: "staff", label: "Staff", icon: UserCheck },
    { id: "hemali", label: "Hemali", icon: Users },
    { id: "fy-summary", label: "FY Summary", icon: TrendingUp },
  ].filter(t => !t.perm || isAdmin || perms[t.perm]);

  if (isAdmin || perms.can_edit_settings) {
    tabs.push({ id: "settings", label: "Settings", icon: Key });
  }

  const activeLabel = tabs.find(t => t.id === activeTab)?.label || "Menu";
  const ActiveIcon = tabs.find(t => t.id === activeTab)?.icon || Menu;

  return (
    <>
      {/* Desktop - horizontal scrollable tabs */}
      <div className="hidden md:flex gap-2 mt-4 border-b border-slate-700 pb-2 overflow-x-auto scrollbar-hide">
        {tabs.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            onClick={() => setActiveTabSafe(id)}
            variant={activeTab === id ? "default" : "ghost"}
            size="sm"
            className={`whitespace-nowrap ${activeTab === id
              ? id === "settings" ? "bg-purple-500 hover:bg-purple-600 text-white" : "bg-amber-500 hover:bg-amber-600 text-slate-900"
              : "text-slate-300 hover:bg-slate-700"}`}
            data-testid={`tab-${id}`}
          >
            <Icon className="w-4 h-4 mr-1" />
            {label}
          </Button>
        ))}
      </div>

      {/* Mobile - hamburger menu */}
      <div className="md:hidden mt-3">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="flex items-center justify-between w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg"
          data-testid="mobile-menu-toggle"
        >
          <div className="flex items-center gap-2">
            <ActiveIcon className="w-4 h-4 text-amber-400" />
            <span className="text-amber-400 font-semibold text-sm">{activeLabel}</span>
          </div>
          {mobileMenuOpen ? <X className="w-5 h-5 text-slate-400" /> : <Menu className="w-5 h-5 text-slate-400" />}
        </button>

        {mobileMenuOpen && (
          <div className="mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden animate-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-3 gap-0.5 p-2">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { setActiveTabSafe(id); setMobileMenuOpen(false); }}
                  className={`flex flex-col items-center gap-1 py-3 px-1 rounded-lg transition-colors ${
                    activeTab === id
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                      : "text-slate-300 hover:bg-slate-700"
                  }`}
                  data-testid={`mobile-tab-${id}`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium leading-tight text-center">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
