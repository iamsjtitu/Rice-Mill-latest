import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Wheat, Users } from "lucide-react";
import SaleBook from "./SaleBook";
import { PaddyPurchase, PartySummary } from "./PaddyPurchase";

export default function Vouchers({ filters, user, onNavigate }) {
  const [activeTab, setActiveTab] = useState("sale");

  return (
    <div className="space-y-4" data-testid="vouchers-page">
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        <Button onClick={() => setActiveTab("sale")}
          variant={activeTab === "sale" ? "default" : "ghost"} size="sm"
          className={activeTab === "sale"
            ? "bg-amber-500 hover:bg-amber-600 text-slate-900"
            : "text-slate-300 hover:bg-slate-700"}
          data-testid="tab-voucher-sale">
          <FileText className="w-4 h-4 mr-1" /> Sale Vouchers
        </Button>
        <Button onClick={() => setActiveTab("purchase")}
          variant={activeTab === "purchase" ? "default" : "ghost"} size="sm"
          className={activeTab === "purchase"
            ? "bg-emerald-500 hover:bg-emerald-600 text-white"
            : "text-slate-300 hover:bg-slate-700"}
          data-testid="tab-voucher-purchase">
          <Wheat className="w-4 h-4 mr-1" /> Paddy Purchase
        </Button>
        <Button onClick={() => setActiveTab("summary")}
          variant={activeTab === "summary" ? "default" : "ghost"} size="sm"
          className={activeTab === "summary"
            ? "bg-sky-500 hover:bg-sky-600 text-white"
            : "text-slate-300 hover:bg-slate-700"}
          data-testid="tab-voucher-summary">
          <Users className="w-4 h-4 mr-1" /> Party Summary
        </Button>
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
