import { Button } from "@/components/ui/button";
import {
  FileSpreadsheet, FileText, BarChart3, TrendingUp, Truck,
  Users, IndianRupee, Key, Wheat, Wallet, Package, UserCheck
} from "lucide-react";

export function TabNavigation({ activeTab, setActiveTabSafe, user }) {
  const tabs = [
    { id: "entries", label: "Entries", icon: FileSpreadsheet },
    { id: "dashboard", label: "Dashboard & Targets", icon: BarChart3 },
    { id: "milling", label: "Milling (CMR)", icon: Wheat },
    { id: "dctracker", label: "DC (Payments)", icon: Truck },
    { id: "vouchers", label: "Vouchers", icon: FileText },
    { id: "cashbook", label: "Cash Book & Ledgers", icon: Wallet },
    { id: "payments", label: "Payments", icon: IndianRupee },
    { id: "reports", label: "Reports", icon: BarChart3 },
    { id: "mill-parts", label: "Mill Parts", icon: Package },
    { id: "staff", label: "Staff", icon: UserCheck },
    { id: "hemali", label: "Hemali", icon: Users },
    { id: "fy-summary", label: "FY Summary", icon: TrendingUp },
  ];

  return (
    <div className="flex gap-2 mt-4 border-b border-slate-700 pb-2">
      {tabs.map(({ id, label, icon: Icon }) => (
        <Button
          key={id}
          onClick={() => setActiveTabSafe(id)}
          variant={activeTab === id ? "default" : "ghost"}
          size="sm"
          className={activeTab === id
            ? "bg-amber-500 hover:bg-amber-600 text-slate-900"
            : "text-slate-300 hover:bg-slate-700"}
          data-testid={`tab-${id}`}
        >
          <Icon className="w-4 h-4 mr-1" />
          {label}
        </Button>
      ))}
      {user.role === 'admin' && (
        <Button
          onClick={() => setActiveTabSafe("settings")}
          variant={activeTab === "settings" ? "default" : "ghost"}
          size="sm"
          className={activeTab === "settings"
            ? "bg-purple-500 hover:bg-purple-600 text-white"
            : "text-slate-300 hover:bg-slate-700"}
          data-testid="tab-settings"
        >
          <Key className="w-4 h-4 mr-1" />
          Settings
        </Button>
      )}
    </div>
  );
}
