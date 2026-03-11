import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, Landmark, Plus, Download, FileText } from "lucide-react";

const SummaryCards = ({ summary, onNewTransaction, onExport }) => {
  if (!summary) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Card className="bg-purple-50 border-purple-200 shadow-sm" data-testid="opening-balance-card">
        <CardContent className="p-4">
          <p className="text-xs text-purple-600 font-medium mb-1">Opening Balance / शुरुआती</p>
          <p className="text-lg font-bold text-purple-800">
            ₹{((summary.opening_cash || 0) + (summary.opening_bank || 0)).toLocaleString('en-IN')}
          </p>
          <div className="flex gap-3 mt-1 text-[10px]">
            <span className="text-green-700 font-medium">Cash: ₹{(summary.opening_cash || 0).toLocaleString('en-IN')}</span>
            <span className="text-blue-700 font-medium">Bank: ₹{(summary.opening_bank || 0).toLocaleString('en-IN')}</span>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-green-50 border-green-200 shadow-sm" data-testid="cash-balance-card">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-green-600" />
            <p className="text-xs text-green-700 font-medium">Cash in Hand / नकद</p>
          </div>
          <p className={`text-2xl font-bold ${summary.cash_balance >= 0 ? 'text-green-800' : 'text-red-600'}`}>
            ₹{summary.cash_balance.toLocaleString('en-IN')}
          </p>
          <div className="flex gap-3 mt-1 text-[10px]">
            <span className="text-green-700 font-medium">In: ₹{summary.cash_in.toLocaleString('en-IN')}</span>
            <span className="text-red-600 font-medium">Out: ₹{summary.cash_out.toLocaleString('en-IN')}</span>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-blue-50 border-blue-200 shadow-sm" data-testid="bank-balance-card">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Landmark className="w-4 h-4 text-blue-600" />
            <p className="text-xs text-blue-700 font-medium">Bank Balance / बैंक</p>
          </div>
          <p className={`text-2xl font-bold ${summary.bank_balance >= 0 ? 'text-blue-800' : 'text-red-600'}`}>
            ₹{summary.bank_balance.toLocaleString('en-IN')}
          </p>
          <div className="flex gap-3 mt-1 text-[10px]">
            <span className="text-green-700 font-medium">In: ₹{summary.bank_in.toLocaleString('en-IN')}</span>
            <span className="text-red-600 font-medium">Out: ₹{summary.bank_out.toLocaleString('en-IN')}</span>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-amber-50 border-amber-200 shadow-sm" data-testid="total-balance-card">
        <CardContent className="p-4">
          <p className="text-xs text-amber-700 font-medium mb-1">Total Balance / कुल</p>
          <p className={`text-2xl font-bold ${summary.total_balance >= 0 ? 'text-amber-800' : 'text-red-600'}`}>
            ₹{summary.total_balance.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] text-slate-600 mt-1">{summary.total_transactions} transactions</p>
        </CardContent>
      </Card>
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardContent className="p-4 flex flex-col justify-center items-center gap-2">
          <Button onClick={onNewTransaction} className="bg-amber-500 hover:bg-amber-600 text-slate-900 w-full" size="sm" data-testid="cashbook-add-btn">
            <Plus className="w-4 h-4 mr-1" /> New Transaction
          </Button>
          <div className="flex gap-1 w-full">
            <Button onClick={() => onExport('excel')} variant="outline" size="sm" className="flex-1 border-green-300 text-green-700 hover:bg-green-50 text-xs" data-testid="cashbook-export-excel">
              <Download className="w-3 h-3 mr-1" /> Excel
            </Button>
            <Button onClick={() => onExport('pdf')} variant="outline" size="sm" className="flex-1 border-red-300 text-red-600 hover:bg-red-50 text-xs" data-testid="cashbook-export-pdf">
              <FileText className="w-3 h-3 mr-1" /> PDF
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SummaryCards;
