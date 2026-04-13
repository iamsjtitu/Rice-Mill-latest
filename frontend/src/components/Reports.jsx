import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Scale, BarChart3, CalendarDays, Users, AlertTriangle } from "lucide-react";
import CMRvsDC from "./reports/CMRvsDC";
import SeasonPnL from "./reports/SeasonPnL";
import DailyReport from "./reports/DailyReport";
import AgentMandiReport from "./reports/AgentMandiReport";
import WeightDiscrepancy from "./WeightDiscrepancy";

const Reports = ({ filters, user }) => {
  const [activeReport, setActiveReport] = useState("cmr-dc");
  return (
    <div className="space-y-3" data-testid="reports-module">
      <div className="flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-700 w-fit flex-wrap">
        {[
          { id: "cmr-dc", label: "CMR vs DC", icon: Scale },
          { id: "pnl", label: "Season P&L", icon: BarChart3 },
          { id: "daily", label: "Daily Report", icon: CalendarDays },
          { id: "agent-mandi", label: "Agent & Mandi", icon: Users },
          { id: "wt-discrepancy", label: "Wt Discrepancy", icon: AlertTriangle },
        ].map(({ id, label, icon: Icon }) => (
          <Button key={id} onClick={() => setActiveReport(id)} variant={activeReport === id ? "default" : "ghost"} size="sm"
            className={activeReport === id ? "bg-amber-500 text-slate-900" : "text-slate-400 hover:text-white hover:bg-slate-700"}
            data-testid={`report-tab-${id}`}>
            <Icon className="w-4 h-4 mr-1" /> {label}
          </Button>
        ))}
      </div>
      {activeReport === "cmr-dc" && <CMRvsDC filters={filters} />}
      {activeReport === "pnl" && <SeasonPnL filters={filters} />}
      {activeReport === "daily" && <DailyReport filters={filters} />}
      {activeReport === "agent-mandi" && <AgentMandiReport filters={filters} />}
      {activeReport === "wt-discrepancy" && <WeightDiscrepancy filters={filters} />}
    </div>
  );
};

export default Reports;
