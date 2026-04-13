import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Wheat, Users, ShoppingBag, Package } from "lucide-react";
import SaleBook from "./SaleBook";
import PurchaseVouchers from "./PurchaseVouchers";
import StockSummary from "./StockSummary";
import { PaddyPurchase, PartySummary } from "./PaddyPurchase";
import ByProductSaleRegister from "./ByProductSaleRegister";

const tabs = [
  { id: "sale", label: "Sales Register", icon: FileText, activeClass: "bg-amber-500 hover:bg-amber-600 text-slate-900" },
  { id: "purchase", label: "Purchase Register", icon: ShoppingBag, activeClass: "bg-emerald-500 hover:bg-emerald-600 text-white" },
  { id: "paddy", label: "Paddy Purchase", icon: Wheat, activeClass: "bg-orange-500 hover:bg-orange-600 text-white" },
  { id: "stock", label: "Stock Summary", icon: Package, activeClass: "bg-sky-500 hover:bg-sky-600 text-white" },
  { id: "summary", label: "Party Summary", icon: Users, activeClass: "bg-purple-500 hover:bg-purple-600 text-white" },
];

const SALE_CATEGORIES = [
  { id: "govt_rice", label: "Govt Rice", type: "salebook", itemName: "Rice (Usna)" },
  { id: "private_rice", label: "Private Rice", type: "salebook", itemName: "Rice (Raw)" },
  { id: "rice_bran", label: "Rice Bran", type: "bp", product: "Rice Bran" },
  { id: "mota_kunda", label: "Mota Kunda", type: "bp", product: "Mota Kunda" },
  { id: "broken_rice", label: "Broken Rice", type: "bp", product: "Broken Rice" },
  { id: "rejection_rice", label: "Rejection Rice", type: "bp", product: "Rejection Rice" },
  { id: "pin_broken_rice", label: "Pin Broken Rice", type: "bp", product: "Pin Broken Rice" },
  { id: "poll", label: "Poll", type: "bp", product: "Poll" },
  { id: "bhusa", label: "Bhusa", type: "bp", product: "Bhusa" },
];

export default function Vouchers({ filters, user, onNavigate }) {
  const [activeTab, setActiveTab] = useState("sale");
  const [saleCat, setSaleCat] = useState("govt_rice");
  useArrowSubTabNav(tabs.map(t => t.id), activeTab, setActiveTab);

  const activeCat = SALE_CATEGORIES.find(c => c.id === saleCat);

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
        <div className="space-y-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {SALE_CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => setSaleCat(cat.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  saleCat === cat.id
                    ? "bg-amber-500 text-slate-900"
                    : "bg-slate-700/60 text-slate-300 hover:bg-slate-600"
                }`}
                data-testid={`sale-cat-${cat.id}`}>
                {cat.label}
              </button>
            ))}
          </div>
          {activeCat?.type === "salebook" ? (
            <SaleBook key={saleCat} filters={filters} user={user} category={activeCat.itemName} />
          ) : activeCat?.type === "bp" ? (
            <ByProductSaleRegister key={saleCat} filters={filters} user={user} product={activeCat.product} />
          ) : null}
        </div>
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
