import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Package, BarChart3 } from "lucide-react";
import StockSummary from "./StockSummary";
import { GunnyBags } from "./DCTracker";

const tabs = [
  { id: "gunny", label: "Gunny Bags Register", icon: Package, activeClass: "bg-amber-500 hover:bg-amber-600 text-slate-900" },
  { id: "stock", label: "Stock Summary", icon: BarChart3, activeClass: "bg-sky-500 hover:bg-sky-600 text-white" },
];

export default function StockRegister({ filters, user }) {
  const [activeTab, setActiveTab] = useState("gunny");

  return (
    <div className="space-y-4" data-testid="stock-register-page">
      <div className="flex gap-2 border-b border-slate-700 pb-2 overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <Button key={t.id} onClick={() => setActiveTab(t.id)}
              variant={activeTab === t.id ? "default" : "ghost"} size="sm"
              className={activeTab === t.id ? t.activeClass : "text-slate-300 hover:bg-slate-700"}
              data-testid={`tab-stock-${t.id}`}>
              <Icon className="w-4 h-4 mr-1" /> {t.label}
            </Button>
          );
        })}
      </div>

      {activeTab === "gunny" ? (
        <GunnyBags filters={filters} user={user} />
      ) : (
        <StockSummary filters={filters} />
      )}
    </div>
  );
}
