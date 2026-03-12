import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Wheat, Users } from "lucide-react";
import SaleBook from "./SaleBook";
import { PaddyPurchase, PartySummary } from "./PaddyPurchase";

export default function Vouchers({ filters, user, onNavigate }) {
  const [activeTab, setActiveTab] = useState("sale");

  const tabs = [
    { id: "sale", label: "Sale Vouchers", icon: FileText, color: "amber" },
    { id: "purchase", label: "Paddy Purchase", icon: Wheat, color: "emerald" },
    { id: "summary", label: "Party Summary", icon: Users, color: "sky" },
  ];

  return (
    <div className="space-y-4" data-testid="vouchers-page">
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        {tabs.map(t => (
          <Button key={t.id} onClick={() => setActiveTab(t.id)}
            variant={activeTab === t.id ? "default" : "ghost"} size="sm"
            className={activeTab === t.id
              ? `bg-${t.color}-500 hover:bg-${t.color}-600 ${t.color === 'amber' ? 'text-slate-900' : 'text-white'}`
              : "text-slate-300 hover:bg-slate-700"}
            data-testid={`tab-voucher-${t.id}`}>
            <t.icon className="w-4 h-4 mr-1" /> {t.label}
          </Button>
        ))}
      </div>

      {activeTab === "sale" ? (
        <SaleBook filters={filters} user={user} />
      ) : activeTab === "purchase" ? (
        <PaddyPurchase filters={filters} user={user} />
      ) : (
        <PartySummary filters={filters} onNavigate={onNavigate} />
      )}
    </div>
  );
}
