import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Wheat, Users, ShoppingBag, Package } from "lucide-react";
import SaleBook from "./SaleBook";
import PurchaseVouchers from "./PurchaseVouchers";
import StockSummary from "./StockSummary";
import { PaddyPurchase, PartySummary } from "./PaddyPurchase";

const tabs = [
  { id: "sale", label: "Sale Vouchers", icon: FileText, activeClass: "bg-amber-500 hover:bg-amber-600 text-slate-900" },
  { id: "purchase", label: "Purchase Vouchers", icon: ShoppingBag, activeClass: "bg-emerald-500 hover:bg-emerald-600 text-white" },
  { id: "paddy", label: "Paddy Purchase", icon: Wheat, activeClass: "bg-orange-500 hover:bg-orange-600 text-white" },
  { id: "stock", label: "Stock Summary", icon: Package, activeClass: "bg-sky-500 hover:bg-sky-600 text-white" },
  { id: "summary", label: "Party Summary", icon: Users, activeClass: "bg-purple-500 hover:bg-purple-600 text-white" },
];

export default function Vouchers({ filters, user, onNavigate }) {
  const [activeTab, setActiveTab] = useState("sale");

  return (
    <div className="space-y-4" data-testid="vouchers-page">
      <div className="flex gap-2 border-b border-slate-700 pb-2 overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <Button key={t.id} onClick={() => setActiveTab(t.id)}
              variant={activeTab === t.id ? "default" : "ghost"} size="sm"
              className={activeTab === t.id ? t.activeClass : "text-slate-300 hover:bg-slate-700"}
              data-testid={`tab-voucher-${t.id}`}>
              <Icon className="w-4 h-4 mr-1" /> {t.label}
            </Button>
          );
        })}
      </div>

      {activeTab === "sale" ? (
        <SaleBook filters={filters} user={user} />
      ) : activeTab === "purchase" ? (
        <PurchaseVouchers filters={filters} user={user} />
      ) : activeTab === "paddy" ? (
        <PaddyPurchase filters={filters} user={user} />
      ) : activeTab === "stock" ? (
        <StockSummary filters={filters} />
      ) : (
        <PartySummary filters={filters} onNavigate={onNavigate} />
      )}
    </div>
  );
}
