import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Wheat, Users, ShoppingBag, Package } from "lucide-react";
import SaleBook from "./SaleBook";
import PurchaseVouchers from "./PurchaseVouchers";
import StockSummary from "./StockSummary";
import { PaddyPurchase, PartySummary } from "./PaddyPurchase";
import ByProductSaleRegister from "./ByProductSaleRegister";
import OilPremiumRegister from "./OilPremiumRegister";

const tabs = [
  { id: "sale", label: "Sales Register", icon: FileText, activeClass: "bg-amber-500 hover:bg-amber-600 text-slate-900" },
  { id: "purchase", label: "Purchase Register", icon: ShoppingBag, activeClass: "bg-emerald-500 hover:bg-emerald-600 text-white" },
  { id: "stock", label: "Stock Summary", icon: Package, activeClass: "bg-sky-500 hover:bg-sky-600 text-white" },
  { id: "summary", label: "Party Summary", icon: Users, activeClass: "bg-purple-500 hover:bg-purple-600 text-white" },
];

const SALE_CATEGORIES = [
  { id: "private_rice", label: "Pvt Rice", type: "salebook", itemName: "Rice (Raw)" },
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
  const [saleCat, setSaleCat] = useState("private_rice");
  const [branSubTab, setBranSubTab] = useState("sales");
  const [purchaseSubTab, setPurchaseSubTab] = useState("vouchers");

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
              <button key={cat.id} onClick={() => { setSaleCat(cat.id); if (cat.id === 'rice_bran') setBranSubTab('sales'); }}
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

          {/* Rice Bran sub-tabs: Sales | Oil Premium */}
          {saleCat === "rice_bran" && (
            <div className="flex gap-2 border-b border-slate-700/50 pb-1.5">
              <button onClick={() => setBranSubTab("sales")}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${branSubTab === "sales" ? "bg-amber-600/30 text-amber-400 border border-amber-500/50" : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"}`}
                data-testid="bran-subtab-sales">
                Sales Register
              </button>
              <button onClick={() => setBranSubTab("oil_premium")}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${branSubTab === "oil_premium" ? "bg-emerald-600/30 text-emerald-400 border border-emerald-500/50" : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"}`}
                data-testid="bran-subtab-oil-premium">
                Oil Premium
              </button>
            </div>
          )}

          {activeCat?.type === "salebook" ? (
            <SaleBook key={saleCat} filters={filters} user={user} category={activeCat.itemName} />
          ) : saleCat === "rice_bran" ? (
            branSubTab === "oil_premium" ? (
              <OilPremiumRegister filters={filters} user={user} />
            ) : (
              <ByProductSaleRegister key={saleCat} filters={filters} user={user} product="Rice Bran" />
            )
          ) : activeCat?.type === "bp" ? (
            <ByProductSaleRegister key={saleCat} filters={filters} user={user} product={activeCat.product} />
          ) : null}
        </div>
      ) : activeTab === "purchase" ? (
        <div className="space-y-3">
          <div className="flex gap-2 border-b border-slate-700/50 pb-1.5">
            <button onClick={() => setPurchaseSubTab("vouchers")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${purchaseSubTab === "vouchers" ? "bg-emerald-600/30 text-emerald-400 border border-emerald-500/50" : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"}`}
              data-testid="purchase-subtab-vouchers">
              <ShoppingBag className="w-3.5 h-3.5 inline mr-1" />Purchase Vouchers
            </button>
            <button onClick={() => setPurchaseSubTab("paddy")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${purchaseSubTab === "paddy" ? "bg-orange-600/30 text-orange-400 border border-orange-500/50" : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"}`}
              data-testid="purchase-subtab-paddy">
              <Wheat className="w-3.5 h-3.5 inline mr-1" />Pvt Paddy Purchase
            </button>
          </div>
          {purchaseSubTab === "paddy" ? (
            <PaddyPurchase filters={filters} user={user} />
          ) : (
            <PurchaseVouchers filters={filters} user={user} />
          )}
        </div>
      ) : activeTab === "stock" ? (
        <StockSummary filters={filters} />
      ) : (
        <PartySummary filters={filters} onNavigate={onNavigate} />
      )}
    </div>
  );
}
