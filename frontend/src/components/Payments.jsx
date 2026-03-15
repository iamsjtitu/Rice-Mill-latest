import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { fmtDate } from "@/utils/date";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Truck, Users, IndianRupee, CheckCircle, Clock, AlertCircle, Undo2, History,
  Target, Download, FileText, FileSpreadsheet, Printer, X, Edit, Fuel, Plus, Trash2, Star, RefreshCw, Handshake, Package,
} from "lucide-react";
import LocalPartyAccount from "./payments/LocalPartyAccount";
import { GunnyBags } from "./DCTracker";
import LeasedTruck from "./LeasedTruck";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

// Safe print helper - uses iframe approach (works in Electron + browser)
const _isElectronEnv = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);

const safePrintHTML = (htmlContent) => {
  try {
    if (_isElectronEnv) {
      const w = window.open('', '_blank', 'width=900,height=700');
      if (w) { w.document.open(); w.document.write(htmlContent); w.document.close(); w.onload = () => w.focus(); }
      else { const b = new Blob([htmlContent], {type:'text/html'}); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href=u; a.download='print.html'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u); }
    } else {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      iframe.contentDocument.open();
      iframe.contentDocument.write(htmlContent);
      iframe.contentDocument.close();
      setTimeout(() => {
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
      }, 500);
    }
  } catch(e) {
    // Fallback: blob download as HTML
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'print.html';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};

export const Payments = ({ filters, user, branding }) => {
  const [truckPayments, setTruckPayments] = useState([]);
  const [agentPayments, setAgentPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePaymentTab, setActivePaymentTab] = useState("truck");
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showRateDialog, setShowRateDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [newRate, setNewRate] = useState("");
  const [truckSearchFilter, setTruckSearchFilter] = useState("");
  const [paymentHistory, setPaymentHistory] = useState([]);
  // Truck Owner Payment states
  const [showOwnerPayDialog, setShowOwnerPayDialog] = useState(false);
  const [showOwnerHistoryDialog, setShowOwnerHistoryDialog] = useState(false);
  const [selectedOwnerTruck, setSelectedOwnerTruck] = useState(null);
  const [ownerPayAmount, setOwnerPayAmount] = useState("");
  const [ownerPayNote, setOwnerPayNote] = useState("");
  const [ownerPayMode, setOwnerPayMode] = useState("cash");
  const [ownerHistory, setOwnerHistory] = useState([]);

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);

      const [truckRes, agentRes] = await Promise.all([
        axios.get(`${API}/truck-payments?${params.toString()}`),
        axios.get(`${API}/agent-payments?${params.toString()}`)
      ]);

      setTruckPayments(truckRes.data || []);
      setAgentPayments(agentRes.data || []);
    } catch (error) {
      console.error("Payments fetch error:", error);
      toast.error("Payments load karne mein error");
    } finally {
      setLoading(false);
    }
  }, [filters.kms_year, filters.season]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Filter truck payments by search
  const filteredTruckPayments = truckSearchFilter
    ? truckPayments.filter(p => 
        p.truck_no.toLowerCase().includes(truckSearchFilter.toLowerCase()) ||
        p.mandi_name.toLowerCase().includes(truckSearchFilter.toLowerCase())
      )
    : truckPayments;

  // Export truck payments to Excel
  const handleExportTruckExcel = async () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    if (truckSearchFilter) params.append('truck_no', truckSearchFilter);
    const { downloadFile } = await import('../utils/download');
    downloadFile(`/api/export/truck-payments-excel?${params.toString()}`, 'truck_payments.xlsx');
  };

  // Export truck payments to PDF
  const handleExportTruckPDF = async () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    if (truckSearchFilter) params.append('truck_no', truckSearchFilter);
    const { downloadFile } = await import('../utils/download');
    downloadFile(`/api/export/truck-payments-pdf?${params.toString()}`, 'truck_payments.pdf');
  };

  // Export agent payments
  const handleExportAgentExcel = async () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    const { downloadFile } = await import('../utils/download');
    downloadFile(`/api/export/agent-payments-excel?${params.toString()}`, 'agent_payments.xlsx');
  };

  const handleExportAgentPDF = async () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    const { downloadFile } = await import('../utils/download');
    downloadFile(`/api/export/agent-payments-pdf?${params.toString()}`, 'agent_payments.pdf');
  };

  // Export Truck Owner Consolidated
  const handleExportTruckOwnerExcel = async () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    const { downloadFile } = await import('../utils/download');
    downloadFile(`/api/export/truck-owner-excel?${params.toString()}`, 'truck_owner.xlsx');
  };

  const handleExportTruckOwnerPDF = async () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    const { downloadFile } = await import('../utils/download');
    downloadFile(`/api/export/truck-owner-pdf?${params.toString()}`, 'truck_owner.pdf');
  };

  // Undo paid
  const handleUndoPaid = async (item) => {
    if (!window.confirm("Kya aap is payment ko undo karna chahte hain? Paid amount 0 ho jayega.")) return;
    try {
      if (activePaymentTab === "truck") {
        await axios.post(
          `${API}/truck-payments/${item.entry_id}/undo-paid?username=${user.username}&role=${user.role}`
        );
      } else {
        await axios.post(
          `${API}/agent-payments/${encodeURIComponent(item.mandi_name)}/undo-paid?kms_year=${item.kms_year}&season=${item.season}&username=${user.username}&role=${user.role}`
        );
      }
      toast.success("Payment undo ho gaya!");
      fetchPayments();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Undo karne mein error");
    }
  };

  // View payment history
  const handleViewHistory = async (item) => {
    try {
      let res;
      if (activePaymentTab === "truck") {
        res = await axios.get(`${API}/truck-payments/${item.entry_id}/history`);
      } else {
        res = await axios.get(
          `${API}/agent-payments/${encodeURIComponent(item.mandi_name)}/history?kms_year=${item.kms_year}&season=${item.season}`
        );
      }
      setPaymentHistory(res.data.history || []);
      setSelectedItem(item);
      setShowHistoryDialog(true);
    } catch (error) {
      toast.error("History load karne mein error");
    }
  };

  // ==== TRUCK OWNER CONSOLIDATED PAYMENT HANDLERS ====
  const handleOwnerPay = async () => {
    if (!ownerPayAmount || !selectedOwnerTruck) return;
    try {
      const params = `kms_year=${filters.kms_year||''}&season=${filters.season||''}&username=${user.username}&role=${user.role}`;
      const res = await axios.post(`${API}/truck-owner/${encodeURIComponent(selectedOwnerTruck.truck_no)}/pay?${params}`, {
        amount: parseFloat(ownerPayAmount), note: ownerPayNote, payment_mode: ownerPayMode
      });
      toast.success(res.data.message);
      setShowOwnerPayDialog(false); setOwnerPayAmount(""); setOwnerPayNote(""); setOwnerPayMode("cash");
      fetchPayments();
    } catch (e) { toast.error(e.response?.data?.detail || "Payment error"); }
  };

  const handleOwnerMarkPaid = async (truck) => {
    if (!window.confirm(`${truck.truck_no} ke saare trips mark paid karna chahte hain?`)) return;
    try {
      const params = `kms_year=${filters.kms_year||''}&season=${filters.season||''}&username=${user.username}&role=${user.role}`;
      const res = await axios.post(`${API}/truck-owner/${encodeURIComponent(truck.truck_no)}/mark-paid?${params}`);
      toast.success(res.data.message); fetchPayments();
    } catch (e) { toast.error(e.response?.data?.detail || "Mark paid error"); }
  };

  const handleOwnerUndoPaid = async (truck) => {
    if (!window.confirm(`${truck.truck_no} ke saare payments undo karna chahte hain?`)) return;
    try {
      const params = `kms_year=${filters.kms_year||''}&season=${filters.season||''}&username=${user.username}&role=${user.role}`;
      const res = await axios.post(`${API}/truck-owner/${encodeURIComponent(truck.truck_no)}/undo-paid?${params}`);
      toast.success(res.data.message); fetchPayments();
    } catch (e) { toast.error(e.response?.data?.detail || "Undo error"); }
  };

  const handleOwnerHistory = async (truck) => {
    try {
      const res = await axios.get(`${API}/truck-owner/${encodeURIComponent(truck.truck_no)}/history?kms_year=${filters.kms_year||''}&season=${filters.season||''}`);
      setOwnerHistory(res.data.history || []); setSelectedOwnerTruck(truck); setShowOwnerHistoryDialog(true);
    } catch (e) { toast.error("History load error"); }
  };


  const handleSetRate = async () => {
    if (!newRate || !selectedItem) return;
    try {
      if (activePaymentTab === "truck") {
        const res = await axios.put(
          `${API}/truck-payments/${selectedItem.entry_id}/rate?username=${user.username}&role=${user.role}`,
          { rate_per_qntl: parseFloat(newRate) }
        );
        const count = res.data?.updated_count || 1;
        if (count > 1) {
          toast.success(`Rate ₹${newRate}/QNTL set! ${count} entries update hui (${res.data.truck_no} - ${res.data.mandi_name})`);
        } else {
          toast.success("Rate set ho gaya!");
        }
      } else {
        await axios.put(
          `${API}/agent-rates/${encodeURIComponent(selectedItem.agent_name)}?kms_year=${filters.kms_year}&season=${filters.season}&username=${user.username}&role=${user.role}`,
          { rate_per_qntl: parseFloat(newRate) }
        );
        toast.success("Rate set ho gaya!");
      }
      setShowRateDialog(false);
      setNewRate("");
      fetchPayments();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Rate set karne mein error");
    }
  };

  const handleMakePayment = async () => {
    if (!paymentAmount || !selectedItem) return;
    try {
      if (activePaymentTab === "truck") {
        await axios.post(
          `${API}/truck-payments/${selectedItem.entry_id}/pay?username=${user.username}&role=${user.role}`,
          { amount: parseFloat(paymentAmount), note: paymentNote }
        );
      } else {
        await axios.post(
          `${API}/agent-payments/${encodeURIComponent(selectedItem.mandi_name)}/pay?kms_year=${selectedItem.kms_year}&season=${selectedItem.season}&username=${user.username}&role=${user.role}`,
          { amount: parseFloat(paymentAmount), note: paymentNote }
        );
      }
      toast.success("Payment recorded!");
      setShowPaymentDialog(false);
      setPaymentAmount("");
      setPaymentNote("");
      fetchPayments();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Payment karne mein error");
    }
  };

  const handleMarkPaid = async (item) => {
    if (!window.confirm("Kya aap isko fully paid mark karna chahte hain?")) return;
    try {
      if (activePaymentTab === "truck") {
        await axios.post(
          `${API}/truck-payments/${item.entry_id}/mark-paid?username=${user.username}&role=${user.role}`
        );
      } else {
        await axios.post(
          `${API}/agent-payments/${encodeURIComponent(item.mandi_name)}/mark-paid?kms_year=${item.kms_year}&season=${item.season}&username=${user.username}&role=${user.role}`
        );
      }
      toast.success("Payment cleared!");
      fetchPayments();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Mark paid mein error");
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'paid':
        return <span className="px-2 py-1 text-xs rounded-full bg-emerald-900/50 text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Paid</span>;
      case 'partial':
        return <span className="px-2 py-1 text-xs rounded-full bg-amber-900/50 text-amber-400 flex items-center gap-1"><Clock className="w-3 h-3" /> Partial</span>;
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-red-900/50 text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Pending</span>;
    }
  };

  // Print Invoice for Truck Payment
  const handlePrintInvoice = (payment) => {
    const invoiceContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Payment Receipt - ${payment.truck_no}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; background: #f5f5f5; }
          .invoice { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 20px; margin-bottom: 20px; }
          .header h1 { color: #f59e0b; font-size: 28px; margin-bottom: 5px; }
          .header p { color: #666; font-size: 14px; }
          .receipt-title { text-align: center; background: #1e293b; color: white; padding: 10px; border-radius: 4px; margin-bottom: 20px; font-size: 18px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
          .info-item { padding: 10px; background: #f8fafc; border-radius: 4px; }
          .info-item label { display: block; font-size: 11px; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
          .info-item span { font-size: 16px; font-weight: 600; color: #1e293b; }
          .amount-section { background: #fef3c7; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .amount-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #fbbf24; }
          .amount-row:last-child { border-bottom: none; }
          .amount-row.total { font-size: 20px; font-weight: bold; color: #1e293b; border-top: 2px solid #f59e0b; margin-top: 10px; padding-top: 15px; }
          .amount-row.deduction { color: #dc2626; }
          .amount-row.paid { color: #059669; }
          .status-badge { display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
          .status-paid { background: #d1fae5; color: #059669; }
          .status-partial { background: #fef3c7; color: #d97706; }
          .status-pending { background: #fee2e2; color: #dc2626; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
          .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
          .signature-box { text-align: center; }
          .signature-line { border-top: 1px solid #1e293b; margin-top: 50px; padding-top: 5px; font-size: 12px; color: #64748b; }
          .print-note { text-align: center; color: #94a3b8; font-size: 11px; margin-top: 20px; }
          @media print {
            @page { size: A4; margin: 10mm; }
            body { background: white; padding: 0; }
            .invoice { box-shadow: none; max-width: 100%; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="header">
            <h1>${branding.company_name}</h1>
            <p>${branding.tagline}</p>
          </div>
          
          <div class="receipt-title">
            PAYMENT RECEIPT / भुगतान रसीद
          </div>
          
          <div class="info-grid">
            <div class="info-item">
              <label>Receipt Date / रसीद दिनांक</label>
              <span>${new Date().toLocaleDateString('en-IN')}</span>
            </div>
            <div class="info-item">
              <label>Trip Date / ट्रिप दिनांक</label>
              <span>${fmtDate(payment.date)}</span>
            </div>
            <div class="info-item">
              <label>Truck Number / ट्रक नंबर</label>
              <span>${payment.truck_no}</span>
            </div>
            <div class="info-item">
              <label>Mandi Name / मंडी</label>
              <span>${payment.mandi_name}</span>
            </div>
            <div class="info-item">
              <label>Final Weight / अंतिम वजन</label>
              <span>${payment.final_qntl} QNTL</span>
            </div>
            <div class="info-item">
              <label>Rate / दर</label>
              <span>Rs. ${payment.rate_per_qntl} /QNTL</span>
            </div>
          </div>
          
          <div class="amount-section">
            <div class="amount-row">
              <span>Gross Amount / कुल राशि</span>
              <span>Rs. ${payment.gross_amount.toLocaleString('en-IN')}</span>
            </div>
            <div class="amount-row deduction">
              <span>Deductions (Cash + Diesel) / कटौती</span>
              <span>- Rs. ${payment.deductions.toLocaleString('en-IN')}</span>
            </div>
            <div class="amount-row total">
              <span>Net Amount / शुद्ध राशि</span>
              <span>Rs. ${payment.net_amount.toLocaleString('en-IN')}</span>
            </div>
            <div class="amount-row paid">
              <span>Amount Paid / भुगतान किया</span>
              <span>Rs. ${payment.paid_amount.toLocaleString('en-IN')}</span>
            </div>
            <div class="amount-row">
              <span>Balance / बाकी</span>
              <span>Rs. ${payment.balance_amount.toLocaleString('en-IN')}</span>
            </div>
          </div>
          
          <div style="text-align: center; margin: 15px 0;">
            <span class="status-badge status-${payment.status}">${payment.status === 'paid' ? 'PAID / भुगतान हो गया' : payment.status === 'partial' ? 'PARTIAL / आंशिक' : 'PENDING / बाकी'}</span>
          </div>
          
          <div class="footer">
            <div class="signature-section">
              <div class="signature-box">
                <div class="signature-line">Driver Signature / ड्राइवर हस्ताक्षर</div>
              </div>
              <div class="signature-box">
                <div class="signature-line">Authorized Signature / अधिकृत हस्ताक्षर</div>
              </div>
            </div>
          </div>
          
          <div class="print-note">
            This is a computer generated receipt / यह कंप्यूटर जनित रसीद है
          </div>
        </div>
        
        <div class="no-print" style="text-align: center; margin-top: 20px;">
          <button onclick="window.print()" style="background: #f59e0b; color: white; border: none; padding: 12px 30px; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold;">
            🖨️ Print Receipt
          </button>
        </div>
      </body>
      </html>
    `;
    safePrintHTML(invoiceContent);
  };

  // Print Invoice for Agent Payment
  const handlePrintAgentInvoice = (payment) => {
    const invoiceContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Agent Payment Receipt - ${payment.mandi_name}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; background: #f5f5f5; }
          .invoice { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 20px; margin-bottom: 20px; }
          .header h1 { color: #f59e0b; font-size: 28px; margin-bottom: 5px; }
          .header p { color: #666; font-size: 14px; }
          .receipt-title { text-align: center; background: #7c3aed; color: white; padding: 10px; border-radius: 4px; margin-bottom: 20px; font-size: 18px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
          .info-item { padding: 10px; background: #f8fafc; border-radius: 4px; }
          .info-item label { display: block; font-size: 11px; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
          .info-item span { font-size: 16px; font-weight: 600; color: #1e293b; }
          .amount-section { background: #ede9fe; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .amount-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #a78bfa; }
          .amount-row:last-child { border-bottom: none; }
          .amount-row.total { font-size: 20px; font-weight: bold; color: #1e293b; border-top: 2px solid #7c3aed; margin-top: 10px; padding-top: 15px; }
          .amount-row.paid { color: #059669; }
          .status-badge { display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
          .status-paid { background: #d1fae5; color: #059669; }
          .status-partial { background: #fef3c7; color: #d97706; }
          .status-pending { background: #fee2e2; color: #dc2626; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
          .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
          .signature-box { text-align: center; }
          .signature-line { border-top: 1px solid #1e293b; margin-top: 50px; padding-top: 5px; font-size: 12px; color: #64748b; }
          .print-note { text-align: center; color: #94a3b8; font-size: 11px; margin-top: 20px; }
          .target-info { background: #fef3c7; padding: 15px; border-radius: 8px; margin-bottom: 15px; }
          .target-info h4 { color: #92400e; margin-bottom: 8px; font-size: 14px; }
          .target-info p { font-size: 13px; color: #78350f; }
          @media print {
            @page { size: A4; margin: 10mm; }
            body { background: white; padding: 0; }
            .invoice { box-shadow: none; max-width: 100%; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="header">
            <h1>${branding.company_name}</h1>
            <p>${branding.tagline}</p>
          </div>
          
          <div class="receipt-title">
            AGENT PAYMENT RECEIPT / एजेंट भुगतान रसीद
          </div>
          
          <div class="info-grid">
            <div class="info-item">
              <label>Receipt Date / रसीद दिनांक</label>
              <span>${new Date().toLocaleDateString('en-IN')}</span>
            </div>
            <div class="info-item">
              <label>KMS Year / Season</label>
              <span>${payment.kms_year} - ${payment.season}</span>
            </div>
            <div class="info-item">
              <label>Mandi Name / मंडी</label>
              <span>${payment.mandi_name}</span>
            </div>
            <div class="info-item">
              <label>Agent Name / एजेंट</label>
              <span>${payment.agent_name}</span>
            </div>
          </div>
          
          <div class="target-info">
            <h4>Target Details / लक्ष्य विवरण</h4>
            <p>Target: ${payment.target_qntl} QNTL + Cutting ${payment.cutting_percent}% = ${(payment.target_qntl + payment.cutting_qntl).toFixed(2)} QNTL</p>
            <p>Achieved: ${payment.achieved_qntl} QNTL ${payment.is_target_complete ? '✅ Complete' : '⏳ In Progress'}</p>
          </div>
          
          <div class="amount-section">
            <div class="amount-row">
              <span>Target Amount / लक्ष्य राशि (${payment.target_qntl} × Rs.${payment.base_rate})</span>
              <span>Rs. ${(payment.target_qntl * payment.base_rate).toLocaleString('en-IN')}</span>
            </div>
            <div class="amount-row">
              <span>Cutting Amount / कटिंग राशि (${payment.cutting_qntl} × Rs.${payment.cutting_rate})</span>
              <span>Rs. ${(payment.cutting_qntl * payment.cutting_rate).toLocaleString('en-IN')}</span>
            </div>
            <div class="amount-row total">
              <span>Total Amount / कुल राशि</span>
              <span>Rs. ${payment.total_amount.toLocaleString('en-IN')}</span>
            </div>
            <div class="amount-row paid">
              <span>Amount Paid / भुगतान किया</span>
              <span>Rs. ${payment.paid_amount.toLocaleString('en-IN')}</span>
            </div>
            <div class="amount-row">
              <span>Balance / बाकी</span>
              <span>Rs. ${payment.balance_amount.toLocaleString('en-IN')}</span>
            </div>
          </div>
          
          <div style="text-align: center; margin: 15px 0;">
            <span class="status-badge status-${payment.status}">${payment.status === 'paid' ? 'PAID / भुगतान हो गया' : payment.status === 'partial' ? 'PARTIAL / आंशिक' : 'PENDING / बाकी'}</span>
          </div>
          
          <div class="footer">
            <div class="signature-section">
              <div class="signature-box">
                <div class="signature-line">Agent Signature / एजेंट हस्ताक्षर</div>
              </div>
              <div class="signature-box">
                <div class="signature-line">Authorized Signature / अधिकृत हस्ताक्षर</div>
              </div>
            </div>
          </div>
          
          <div class="print-note">
            This is a computer generated receipt / यह कंप्यूटर जनित रसीद है
          </div>
        </div>
        
        <div class="no-print" style="text-align: center; margin-top: 20px;">
          <button onclick="window.print()" style="background: #7c3aed; color: white; border: none; padding: 12px 30px; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold;">
            🖨️ Print Receipt
          </button>
        </div>
      </body>
      </html>
    `;
    safePrintHTML(invoiceContent);
  };

  // Calculate Truck-wise consolidated payments (group by truck_no)
  const truckWiseConsolidated = filteredTruckPayments.reduce((acc, payment) => {
    const truckNo = payment.truck_no;
    if (!acc[truckNo]) {
      acc[truckNo] = {
        truck_no: truckNo,
        trips: [],
        total_final_qntl: 0,
        total_gross: 0,
        total_deductions: 0,
        total_net: 0,
        total_paid: 0,
        total_balance: 0,
        has_pvt: false
      };
    }
    acc[truckNo].trips.push(payment);
    if (payment.source === 'Pvt Paddy') acc[truckNo].has_pvt = true;
    acc[truckNo].total_final_qntl += payment.final_qntl;
    acc[truckNo].total_gross += payment.gross_amount;
    acc[truckNo].total_deductions += payment.deductions;
    acc[truckNo].total_net += payment.net_amount;
    acc[truckNo].total_paid += payment.paid_amount;
    acc[truckNo].total_balance += payment.balance_amount;
    // Compute owner status
    const tp = acc[truckNo].total_paid;
    const tn = acc[truckNo].total_net;
    const tb = acc[truckNo].total_balance;
    if (tp === 0) acc[truckNo].status = "pending";
    else if (tb < 0.10) acc[truckNo].status = "paid";
    else acc[truckNo].status = "partial";
    return acc;
  }, {});

  const consolidatedTruckList = Object.values(truckWiseConsolidated);

  // Print Consolidated Truck Invoice
  const handlePrintConsolidatedInvoice = (truckData) => {
    const tripsHtml = truckData.trips.map(t => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${t.date}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${t.mandi_name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${t.final_qntl}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">Rs.${t.rate_per_qntl}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">Rs.${t.gross_amount.toLocaleString('en-IN')}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #dc2626;">-Rs.${t.deductions.toLocaleString('en-IN')}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;">Rs.${t.net_amount.toLocaleString('en-IN')}</td>
      </tr>
    `).join('');

    const invoiceContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Truck Owner Payment - ${truckData.truck_no}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; background: #f5f5f5; }
          .invoice { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 20px; margin-bottom: 20px; }
          .header h1 { color: #f59e0b; font-size: 28px; margin-bottom: 5px; }
          .header p { color: #666; font-size: 14px; }
          .receipt-title { text-align: center; background: #0891b2; color: white; padding: 10px; border-radius: 4px; margin-bottom: 20px; font-size: 18px; }
          .truck-info { background: #ecfeff; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center; }
          .truck-info h2 { color: #0e7490; font-size: 24px; }
          .truck-info p { color: #155e75; margin-top: 5px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
          th { background: #1e293b; color: white; padding: 10px; text-align: left; }
          th:nth-child(n+3) { text-align: right; }
          .summary { background: #fef3c7; padding: 20px; border-radius: 8px; margin-top: 20px; }
          .summary-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #fbbf24; }
          .summary-row:last-child { border-bottom: none; }
          .summary-row.total { font-size: 22px; font-weight: bold; color: #1e293b; border-top: 2px solid #f59e0b; margin-top: 10px; padding-top: 15px; }
          .summary-row.paid { color: #059669; }
          .summary-row.balance { color: #dc2626; }
          .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
          .signature-box { text-align: center; }
          .signature-line { border-top: 1px solid #1e293b; margin-top: 50px; padding-top: 5px; font-size: 12px; color: #64748b; }
          .print-note { text-align: center; color: #94a3b8; font-size: 11px; margin-top: 20px; }
          @media print {
            @page { size: A4; margin: 10mm; }
            body { background: white; padding: 0; }
            .invoice { box-shadow: none; max-width: 100%; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="header">
            <h1>${branding.company_name}</h1>
            <p>${branding.tagline}</p>
          </div>
          
          <div class="receipt-title">
            TRUCK OWNER CONSOLIDATED PAYMENT / ट्रक मालिक समेकित भुगतान
          </div>
          
          <div class="truck-info">
            <h2>🚛 ${truckData.truck_no}</h2>
            <p>Total Trips: ${truckData.trips.length} | Receipt Date: ${new Date().toLocaleDateString('en-IN')}</p>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Mandi</th>
                <th>QNTL</th>
                <th>Rate</th>
                <th>Gross</th>
                <th>Deductions</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              ${tripsHtml}
            </tbody>
          </table>
          
          <div class="summary">
            <div class="summary-row">
              <span>Total Weight / कुल वजन</span>
              <span>${truckData.total_final_qntl.toFixed(2)} QNTL</span>
            </div>
            <div class="summary-row">
              <span>Total Gross / कुल राशि</span>
              <span>Rs. ${truckData.total_gross.toLocaleString('en-IN')}</span>
            </div>
            <div class="summary-row" style="color: #dc2626;">
              <span>Total Deductions / कुल कटौती (Cash + Diesel)</span>
              <span>- Rs. ${truckData.total_deductions.toLocaleString('en-IN')}</span>
            </div>
            <div class="summary-row total">
              <span>Net Payable / देय राशि</span>
              <span>Rs. ${truckData.total_net.toLocaleString('en-IN')}</span>
            </div>
            <div class="summary-row paid">
              <span>Already Paid / पहले से भुगतान</span>
              <span>Rs. ${truckData.total_paid.toLocaleString('en-IN')}</span>
            </div>
            <div class="summary-row balance">
              <span>Balance Due / बकाया राशि</span>
              <span>Rs. ${truckData.total_balance.toLocaleString('en-IN')}</span>
            </div>
          </div>
          
          <div class="signature-section">
            <div class="signature-box">
              <div class="signature-line">Truck Owner Signature / ट्रक मालिक हस्ताक्षर</div>
            </div>
            <div class="signature-box">
              <div class="signature-line">Authorized Signature / अधिकृत हस्ताक्षर</div>
            </div>
          </div>
          
          <div class="print-note">
            This is a computer generated receipt / यह कंप्यूटर जनित रसीद है
          </div>
        </div>
        
        <div class="no-print" style="text-align: center; margin-top: 20px;">
          <button onclick="window.print()" style="background: #0891b2; color: white; border: none; padding: 12px 30px; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold;">
            🖨️ Print Receipt
          </button>
        </div>
      </body>
      </html>
    `;
    safePrintHTML(invoiceContent);
  };

  // Calculate totals for filtered truck payments
  const truckTotals = {
    netAmount: filteredTruckPayments.reduce((sum, p) => sum + p.net_amount, 0),
    paid: filteredTruckPayments.reduce((sum, p) => sum + p.paid_amount, 0),
    balance: filteredTruckPayments.reduce((sum, p) => sum + p.balance_amount, 0)
  };

  const agentTotals = {
    totalAmount: agentPayments.reduce((sum, p) => sum + p.total_amount, 0),
    paid: agentPayments.reduce((sum, p) => sum + p.paid_amount, 0),
    balance: agentPayments.reduce((sum, p) => sum + p.balance_amount, 0)
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Payment Tabs */}
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        <Button
          onClick={() => setActivePaymentTab("truck")}
          variant={activePaymentTab === "truck" ? "default" : "ghost"}
          size="sm"
          className={activePaymentTab === "truck" 
            ? "bg-amber-500 hover:bg-amber-600 text-slate-900" 
            : "text-slate-300 hover:bg-slate-700"}
        >
          <Truck className="w-4 h-4 mr-1" />
          Truck Payments ({filteredTruckPayments.length})
        </Button>
        <Button
          onClick={() => setActivePaymentTab("consolidated")}
          variant={activePaymentTab === "consolidated" ? "default" : "ghost"}
          size="sm"
          className={activePaymentTab === "consolidated" 
            ? "bg-cyan-500 hover:bg-cyan-600 text-slate-900" 
            : "text-slate-300 hover:bg-slate-700"}
        >
          <Truck className="w-4 h-4 mr-1" />
          Truck Owner ({consolidatedTruckList.length})
        </Button>
        <Button
          onClick={() => setActivePaymentTab("agent")}
          variant={activePaymentTab === "agent" ? "default" : "ghost"}
          size="sm"
          className={activePaymentTab === "agent" 
            ? "bg-amber-500 hover:bg-amber-600 text-slate-900" 
            : "text-slate-300 hover:bg-slate-700"}
        >
          <Users className="w-4 h-4 mr-1" />
          Agent Payments ({agentPayments.length})
        </Button>
        <Button
          onClick={() => setActivePaymentTab("diesel")}
          variant={activePaymentTab === "diesel" ? "default" : "ghost"}
          size="sm"
          className={activePaymentTab === "diesel" 
            ? "bg-orange-500 hover:bg-orange-600 text-slate-900" 
            : "text-slate-300 hover:bg-slate-700"}
          data-testid="tab-diesel"
        >
          <Fuel className="w-4 h-4 mr-1" />
          Diesel Account
        </Button>
        <Button
          onClick={() => setActivePaymentTab("local-party")}
          variant={activePaymentTab === "local-party" ? "default" : "ghost"}
          size="sm"
          className={activePaymentTab === "local-party" 
            ? "bg-teal-500 hover:bg-teal-600 text-white" 
            : "text-slate-300 hover:bg-slate-700"}
          data-testid="tab-local-party"
        >
          <Handshake className="w-4 h-4 mr-1" />
          Local Party
        </Button>
        <Button
          onClick={() => setActivePaymentTab("gunny")}
          variant={activePaymentTab === "gunny" ? "default" : "ghost"}
          size="sm"
          className={activePaymentTab === "gunny" 
            ? "bg-amber-600 hover:bg-amber-700 text-white" 
            : "text-slate-300 hover:bg-slate-700"}
          data-testid="tab-gunny"
        >
          <Package className="w-4 h-4 mr-1" />
          Gunny Bags
        </Button>
        <Button
          onClick={() => setActivePaymentTab("leased-truck")}
          variant={activePaymentTab === "leased-truck" ? "default" : "ghost"}
          size="sm"
          className={activePaymentTab === "leased-truck" 
            ? "bg-violet-500 hover:bg-violet-600 text-white" 
            : "text-slate-300 hover:bg-slate-700"}
          data-testid="tab-leased-truck"
        >
          <Truck className="w-4 h-4 mr-1" />
          Leased Truck
        </Button>
      </div>

      {/* Truck Filter & Export - Only for Truck Tab */}
      {activePaymentTab === "truck" && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] max-w-[300px]">
            <Input
              placeholder="Truck No. ya Mandi search karein..."
              value={truckSearchFilter}
              onChange={(e) => setTruckSearchFilter(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white text-sm"
            />
          </div>
          {truckSearchFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTruckSearchFilter("")}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button
              onClick={handleExportTruckExcel}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <FileSpreadsheet className="w-4 h-4 mr-1" />
              Excel
            </Button>
            <Button
              onClick={handleExportTruckPDF}
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <FileText className="w-4 h-4 mr-1" />
              PDF
            </Button>
          </div>
        </div>
      )}

      {/* Summary Cards - Only for truck and agent tabs */}
      {(activePaymentTab === "truck" || activePaymentTab === "agent") && (
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-slate-700/50 border-slate-600">
          <CardContent className="p-4">
            <p className="text-slate-400 text-xs">Total Amount</p>
            <p className="text-white text-xl font-bold">
              ₹{(activePaymentTab === "truck" ? truckTotals.netAmount : agentTotals.totalAmount).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-900/30 border-emerald-600/50">
          <CardContent className="p-4">
            <p className="text-emerald-400 text-xs">Paid</p>
            <p className="text-emerald-400 text-xl font-bold">
              ₹{(activePaymentTab === "truck" ? truckTotals.paid : agentTotals.paid).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-red-900/30 border-red-600/50">
          <CardContent className="p-4">
            <p className="text-red-400 text-xs">Balance</p>
            <p className="text-red-400 text-xl font-bold">
              ₹{(activePaymentTab === "truck" ? truckTotals.balance : agentTotals.balance).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Truck Payments Table */}
      {activePaymentTab === "truck" && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-amber-400 flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Truck Payments (Bhada)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-600">
                    <TableHead className="text-slate-300">Date</TableHead>
                    <TableHead className="text-slate-300">Truck No</TableHead>
                    <TableHead className="text-slate-300">Mandi</TableHead>
                    <TableHead className="text-slate-300 text-right">Final QNTL</TableHead>
                    <TableHead className="text-slate-300 text-right">Rate</TableHead>
                    <TableHead className="text-slate-300 text-right">Gross</TableHead>
                    <TableHead className="text-slate-300 text-right">Cash+Diesel</TableHead>
                    <TableHead className="text-slate-300 text-right">Net</TableHead>
                    <TableHead className="text-slate-300 text-right">Paid</TableHead>
                    <TableHead className="text-slate-300 text-right">Balance</TableHead>
                    <TableHead className="text-slate-300">Status</TableHead>
                    {user.role === 'admin' && <TableHead className="text-slate-300">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTruckPayments.map((payment, idx) => (
                    <TableRow key={idx} className="border-slate-700 hover:bg-slate-700/50">
                      <TableCell className="text-white text-xs">{fmtDate(payment.date)}</TableCell>
                      <TableCell className="text-white font-semibold">
                        {payment.truck_no}
                        {payment.source === 'Pvt Paddy' && <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded bg-purple-900/60 text-purple-300 font-medium">Pvt</span>}
                      </TableCell>
                      <TableCell className="text-slate-300 text-xs">{payment.mandi_name}</TableCell>
                      <TableCell className="text-amber-400 text-right font-semibold">{payment.final_qntl}</TableCell>
                      <TableCell className="text-right">
                        <span className="text-blue-400">₹{payment.rate_per_qntl}</span>
                      </TableCell>
                      <TableCell className="text-right text-slate-300">₹{payment.gross_amount}</TableCell>
                      <TableCell className="text-right text-red-400">-₹{payment.deductions}</TableCell>
                      <TableCell className="text-right text-white font-semibold">₹{payment.net_amount}</TableCell>
                      <TableCell className="text-right text-emerald-400">₹{payment.paid_amount}</TableCell>
                      <TableCell className="text-right text-red-400 font-semibold">₹{payment.balance_amount}</TableCell>
                      <TableCell>{getStatusBadge(payment.status)}</TableCell>
                      {user.role === 'admin' && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setSelectedItem(payment); setNewRate(payment.rate_per_qntl.toString()); setShowRateDialog(true); }}
                              className="h-7 px-2 text-blue-400 hover:bg-blue-900/30"
                              title="Set Rate"
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            {payment.status !== 'paid' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { setSelectedItem(payment); setShowPaymentDialog(true); }}
                                  className="h-7 px-2 text-emerald-400 hover:bg-emerald-900/30"
                                  title="Make Payment"
                                >
                                  <IndianRupee className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleMarkPaid(payment)}
                                  className="h-7 px-2 text-amber-400 hover:bg-amber-900/30"
                                  title="Mark Paid"
                                >
                                  <CheckCircle className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                            {payment.status === 'paid' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleUndoPaid(payment)}
                                className="h-7 px-2 text-red-400 hover:bg-red-900/30"
                                title="Undo Paid"
                              >
                                <Undo2 className="w-3 h-3" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleViewHistory(payment)}
                              className="h-7 px-2 text-purple-400 hover:bg-purple-900/30"
                              title="Payment History"
                            >
                              <History className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handlePrintInvoice(payment)}
                              className="h-7 px-2 text-cyan-400 hover:bg-cyan-900/30"
                              title="Print Receipt"
                            >
                              <Printer className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Truck Owner Consolidated Payments */}
      {activePaymentTab === "consolidated" && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg text-cyan-400 flex items-center gap-2">
                  <Truck className="w-5 h-5" />
                  Truck Owner Consolidated Payments (ट्रक मालिक समेकित भुगतान)
                </CardTitle>
                <p className="text-slate-400 text-xs mt-1">
                  Ek truck ke saare trips ka total - sab cut karke final amount
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleExportTruckOwnerExcel}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-1" />
                  Excel
                </Button>
                <Button
                  onClick={handleExportTruckOwnerPDF}
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <FileText className="w-4 h-4 mr-1" />
                  PDF
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {consolidatedTruckList.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-600">
                      <TableHead className="text-slate-300">Truck No</TableHead>
                      <TableHead className="text-slate-300 text-center">Trips</TableHead>
                      <TableHead className="text-slate-300 text-right">Total QNTL</TableHead>
                      <TableHead className="text-slate-300 text-right">Gross Amount</TableHead>
                      <TableHead className="text-slate-300 text-right">Deductions</TableHead>
                      <TableHead className="text-slate-300 text-right">Net Payable</TableHead>
                      <TableHead className="text-slate-300 text-right">Paid</TableHead>
                      <TableHead className="text-slate-300 text-right">Balance</TableHead>
                      <TableHead className="text-slate-300 text-center">Status</TableHead>
                      <TableHead className="text-slate-300">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {consolidatedTruckList.map((truckData, idx) => (
                      <TableRow key={idx} className="border-slate-700 hover:bg-slate-700/50">
                        <TableCell className="text-white font-bold text-lg">
                          {truckData.truck_no}
                          {truckData.has_pvt && <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-purple-900/60 text-purple-300 font-medium align-middle">Pvt</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="bg-slate-600 px-2 py-1 rounded-full text-xs text-white">
                            {truckData.trips.length} trips
                          </span>
                        </TableCell>
                        <TableCell className="text-amber-400 text-right font-semibold">
                          {truckData.total_final_qntl.toFixed(2)} QNTL
                        </TableCell>
                        <TableCell className="text-slate-300 text-right">
                          ₹{truckData.total_gross.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-red-400 text-right">
                          -₹{truckData.total_deductions.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-white text-right font-bold text-lg">
                          ₹{truckData.total_net.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-emerald-400 text-right">
                          ₹{truckData.total_paid.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-bold ${truckData.total_balance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            ₹{truckData.total_balance.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            truckData.status === 'paid' ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-600' :
                            truckData.status === 'partial' ? 'bg-amber-900/50 text-amber-400 border border-amber-600' :
                            'bg-red-900/50 text-red-400 border border-red-600'
                          }`} data-testid={`owner-status-${idx}`}>
                            {truckData.status === 'paid' ? 'Paid' : truckData.status === 'partial' ? 'Partial' : 'Pending'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {user.role === 'admin' && truckData.status !== 'paid' && (
                              <>
                                <Button size="sm" variant="ghost"
                                  onClick={() => { setSelectedOwnerTruck(truckData); setOwnerPayAmount(""); setOwnerPayNote(""); setShowOwnerPayDialog(true); }}
                                  className="h-7 px-2 text-emerald-400 hover:bg-emerald-900/30 border border-emerald-600 text-xs"
                                  data-testid={`owner-pay-${idx}`}>
                                  Make Payment
                                </Button>
                                <Button size="sm" variant="ghost"
                                  onClick={() => handleOwnerMarkPaid(truckData)}
                                  className="h-7 px-2 text-blue-400 hover:bg-blue-900/30 border border-blue-600 text-xs"
                                  data-testid={`owner-markpaid-${idx}`}>
                                  Mark Paid
                                </Button>
                              </>
                            )}
                            {user.role === 'admin' && truckData.status !== 'pending' && (
                              <Button size="sm" variant="ghost"
                                onClick={() => handleOwnerUndoPaid(truckData)}
                                className="h-7 px-2 text-orange-400 hover:bg-orange-900/30 border border-orange-600 text-xs"
                                data-testid={`owner-undo-${idx}`}>
                                Undo Paid
                              </Button>
                            )}
                            <Button size="sm" variant="ghost"
                              onClick={() => handleOwnerHistory(truckData)}
                              className="h-7 px-2 text-purple-400 hover:bg-purple-900/30 border border-purple-600 text-xs"
                              data-testid={`owner-history-${idx}`}>
                              History
                            </Button>
                            <Button size="sm" variant="ghost"
                              onClick={() => handlePrintConsolidatedInvoice(truckData)}
                              className="h-7 px-2 text-cyan-400 hover:bg-cyan-900/30 border border-cyan-600 text-xs">
                              <Printer className="w-3 h-3 mr-1" /> Print
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                
                {/* Consolidated Total Summary */}
                <div className="mt-4 p-4 bg-slate-700/50 rounded-lg">
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-slate-400 text-xs">Total Trucks</p>
                      <p className="text-white font-bold text-xl">{consolidatedTruckList.length}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs">Total Net Payable</p>
                      <p className="text-white font-bold text-xl">
                        ₹{consolidatedTruckList.reduce((sum, t) => sum + t.total_net, 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs">Total Paid</p>
                      <p className="text-emerald-400 font-bold text-xl">
                        ₹{consolidatedTruckList.reduce((sum, t) => sum + t.total_paid, 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs">Total Balance</p>
                      <p className="text-red-400 font-bold text-xl">
                        ₹{consolidatedTruckList.reduce((sum, t) => sum + t.total_balance, 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <Truck className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Koi truck payment nahi hai</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Agent Payments Table */}
      {activePaymentTab === "agent" && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-amber-400 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Agent/Mandi Payments (Target Based)
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  onClick={handleExportAgentExcel}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-1" />
                  Excel
                </Button>
                <Button
                  onClick={handleExportAgentPDF}
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <FileText className="w-4 h-4 mr-1" />
                  PDF
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {agentPayments.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-600">
                      <TableHead className="text-slate-300">Mandi</TableHead>
                      <TableHead className="text-slate-300">Agent</TableHead>
                      <TableHead className="text-slate-300 text-right">Target</TableHead>
                      <TableHead className="text-slate-300 text-right">Cutting</TableHead>
                      <TableHead className="text-slate-300 text-right">Rates</TableHead>
                      <TableHead className="text-slate-300 text-right">Total Amount</TableHead>
                      <TableHead className="text-slate-300 text-right">Achieved</TableHead>
                      <TableHead className="text-slate-300 text-right">Paid</TableHead>
                      <TableHead className="text-slate-300 text-right">Balance</TableHead>
                      <TableHead className="text-slate-300">Status</TableHead>
                      {user.role === 'admin' && <TableHead className="text-slate-300">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentPayments.map((payment, idx) => (
                      <TableRow key={idx} className="border-slate-700 hover:bg-slate-700/50">
                        <TableCell className="text-white font-semibold">{payment.mandi_name}</TableCell>
                        <TableCell className="text-slate-300 text-xs">{payment.agent_name}</TableCell>
                        <TableCell className="text-amber-400 text-right">{payment.target_qntl} QNTL</TableCell>
                        <TableCell className="text-right text-xs">
                          <span className="text-slate-400">{payment.cutting_qntl} QNTL</span>
                          <span className="text-slate-500 ml-1">({payment.cutting_percent}%)</span>
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          <span className="text-blue-400">₹{payment.base_rate}</span>
                          <span className="text-slate-500"> + </span>
                          <span className="text-purple-400">₹{payment.cutting_rate}</span>
                        </TableCell>
                        <TableCell className="text-right text-white font-semibold">₹{payment.total_amount}</TableCell>
                        <TableCell className="text-right">
                          <span className={payment.is_target_complete ? 'text-emerald-400' : 'text-amber-400'}>
                            {payment.achieved_qntl} QNTL
                          </span>
                          {payment.is_target_complete && <CheckCircle className="w-3 h-3 inline ml-1 text-emerald-400" />}
                        </TableCell>
                        <TableCell className="text-right text-emerald-400">₹{payment.paid_amount}</TableCell>
                        <TableCell className="text-right text-red-400 font-semibold">₹{payment.balance_amount}</TableCell>
                        <TableCell>{getStatusBadge(payment.status)}</TableCell>
                        {user.role === 'admin' && (
                          <TableCell>
                            <div className="flex gap-1">
                              {payment.status !== 'paid' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => { setSelectedItem(payment); setShowPaymentDialog(true); }}
                                    className="h-7 px-2 text-emerald-400 hover:bg-emerald-900/30"
                                    title="Make Payment"
                                  >
                                    <IndianRupee className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleMarkPaid(payment)}
                                    className="h-7 px-2 text-amber-400 hover:bg-amber-900/30"
                                    title="Mark Paid"
                                  >
                                    <CheckCircle className="w-3 h-3" />
                                  </Button>
                                </>
                              )}
                              {payment.status === 'paid' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleUndoPaid(payment)}
                                  className="h-7 px-2 text-red-400 hover:bg-red-900/30"
                                  title="Undo Paid"
                                >
                                  <Undo2 className="w-3 h-3" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleViewHistory(payment)}
                                className="h-7 px-2 text-purple-400 hover:bg-purple-900/30"
                                title="Payment History"
                              >
                                <History className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handlePrintAgentInvoice(payment)}
                                className="h-7 px-2 text-cyan-400 hover:bg-cyan-900/30"
                                title="Print Receipt"
                              >
                                <Printer className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Koi mandi target set nahi hai</p>
                <p className="text-xs mt-1">Pehle Dashboard mein Mandi Target set karein</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <History className="w-5 h-5" />
              Payment History
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-slate-300 text-sm border-b border-slate-600 pb-2">
              {activePaymentTab === "truck" 
                ? `Truck: ${selectedItem?.truck_no}` 
                : `Mandi: ${selectedItem?.mandi_name}`}
            </p>
            {paymentHistory.length > 0 ? (
              <div className="max-h-[300px] overflow-y-auto space-y-2">
                {paymentHistory.map((record, idx) => (
                  <div 
                    key={idx} 
                    className={`p-3 rounded-lg border ${
                      record.amount < 0 
                        ? 'bg-red-900/20 border-red-600/50' 
                        : 'bg-slate-700/50 border-slate-600'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className={`font-bold ${record.amount < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                          {record.amount < 0 ? '' : '+'}₹{Math.abs(record.amount).toLocaleString()}
                        </p>
                        <p className="text-slate-400 text-xs">{record.note || 'Payment'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-slate-400 text-xs">
                          {new Date(record.date).toLocaleDateString('hi-IN')}
                        </p>
                        <p className="text-slate-500 text-xs">by {record.by}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-center py-4">Koi payment record nahi hai</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rate Dialog */}
      <Dialog open={showRateDialog} onOpenChange={setShowRateDialog}>
        <DialogContent className="max-w-sm bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-amber-400">Rate Set Karein</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-slate-300 text-sm">
              {activePaymentTab === "truck" 
                ? `Truck: ${selectedItem?.truck_no}` 
                : `Agent: ${selectedItem?.agent_name}`}
            </p>
            <div>
              <Label className="text-slate-300">Rate per QNTL (₹)</Label>
              <Input
                type="number"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                placeholder="32"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowRateDialog(false)} className="border-slate-600 text-slate-300">
                Cancel
              </Button>
              <Button onClick={handleSetRate} className="bg-amber-500 hover:bg-amber-600 text-slate-900">
                Save Rate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {activePaymentTab === "diesel" && <DieselAccount filters={filters} user={user} />}
      {activePaymentTab === "local-party" && <LocalPartyAccount filters={filters} user={user} />}
      {activePaymentTab === "gunny" && <GunnyBags filters={filters} user={user} />}
      {activePaymentTab === "leased-truck" && <LeasedTruck filters={filters} />}

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-sm bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-amber-400">Payment Karein</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-slate-700/50 rounded-lg">
              <p className="text-slate-300 text-sm">
                {activePaymentTab === "truck" 
                  ? `Truck: ${selectedItem?.truck_no}` 
                  : `Agent: ${selectedItem?.agent_name}`}
              </p>
              <p className="text-white font-semibold">
                Balance: ₹{selectedItem?.balance_amount || 0}
              </p>
            </div>
            <div>
              <Label className="text-slate-300">Payment Amount (₹)</Label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="Enter amount"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div>
              <Label className="text-slate-300">Note (Optional)</Label>
              <Input
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="Payment note..."
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowPaymentDialog(false)} className="border-slate-600 text-slate-300">
                Cancel
              </Button>
              <Button onClick={handleMakePayment} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <IndianRupee className="w-4 h-4 mr-1" />
                Pay
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Truck Owner Pay Dialog */}
      <Dialog open={showOwnerPayDialog} onOpenChange={setShowOwnerPayDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-emerald-400">Make Payment - {selectedOwnerTruck?.truck_no}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {selectedOwnerTruck && (
              <div className="bg-slate-700/50 rounded-lg p-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Net Payable:</span><span className="text-white font-bold">₹{selectedOwnerTruck.total_net?.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Already Paid:</span><span className="text-emerald-400">₹{selectedOwnerTruck.total_paid?.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Balance:</span><span className="text-red-400 font-bold">₹{selectedOwnerTruck.total_balance?.toLocaleString()}</span></div>
              </div>
            )}
            <div>
              <Label className="text-slate-300 text-xs">Amount (₹)</Label>
              <Input type="number" value={ownerPayAmount} onChange={(e) => setOwnerPayAmount(e.target.value)}
                placeholder={`Max: ${selectedOwnerTruck?.total_balance?.toLocaleString()}`}
                className="bg-slate-700 border-slate-600 text-white mt-1" data-testid="owner-pay-amount" />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Payment Mode</Label>
              <Select value={ownerPayMode} onValueChange={setOwnerPayMode}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash (नकद)</SelectItem>
                  <SelectItem value="bank">Bank (बैंक)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Note (Optional)</Label>
              <Input value={ownerPayNote} onChange={(e) => setOwnerPayNote(e.target.value)}
                placeholder="Payment details..." className="bg-slate-700 border-slate-600 text-white mt-1" />
            </div>
            <Button onClick={handleOwnerPay} disabled={!ownerPayAmount || parseFloat(ownerPayAmount) <= 0}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="owner-pay-submit">
              Pay ₹{ownerPayAmount ? parseFloat(ownerPayAmount).toLocaleString() : '0'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Truck Owner History Dialog */}
      <Dialog open={showOwnerHistoryDialog} onOpenChange={setShowOwnerHistoryDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-purple-400">Payment History - {selectedOwnerTruck?.truck_no}</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-2">
            {ownerHistory.length === 0 ? (
              <p className="text-slate-400 text-center py-4">Koi payment history nahi hai</p>
            ) : ownerHistory.map((h, idx) => (
              <div key={idx} className={`p-2 rounded border text-sm ${h.amount >= 0 ? 'bg-emerald-900/20 border-emerald-700/30' : 'bg-red-900/20 border-red-700/30'}`}>
                <div className="flex justify-between items-center">
                  <span className={`font-bold ${h.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {h.amount >= 0 ? '+' : ''}₹{Math.abs(h.amount).toLocaleString()}
                  </span>
                  <span className="text-slate-500 text-xs">
                    {h.source === 'owner' ? 'Owner' : 'Trip'} | {h.payment_mode || 'cash'}
                  </span>
                </div>
                <div className="text-slate-400 text-xs mt-1">
                  {h.note} {h.by ? `| by ${h.by}` : ''} | {h.date ? new Date(h.date).toLocaleDateString('en-IN') : ''}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ============ DIESEL ACCOUNT COMPONENT ============
const DieselAccount = ({ filters, user }) => {
  const [pumps, setPumps] = useState([]);
  const [summary, setSummary] = useState(null);
  const [txns, setTxns] = useState([]);
  const [selectedPump, setSelectedPump] = useState("all");
  const [loading, setLoading] = useState(true);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterTruck, setFilterTruck] = useState("");
  const [showAddPump, setShowAddPump] = useState(false);
  const [newPumpName, setNewPumpName] = useState("");
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [payPumpId, setPayPumpId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState("");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      if (selectedPump !== "all") p.append('pump_id', selectedPump);
      if (filterDateFrom) p.append('date_from', filterDateFrom);
      if (filterDateTo) p.append('date_to', filterDateTo);
      if (filterType !== "all") p.append('txn_type', filterType);
      if (filterTruck.trim()) p.append('truck_no', filterTruck.trim());
      const [pRes, sRes, tRes] = await Promise.all([
        axios.get(`${API}/diesel-pumps`),
        axios.get(`${API}/diesel-accounts/summary?${p}`),
        axios.get(`${API}/diesel-accounts?${p}`)
      ]);
      setPumps(pRes.data || []);
      setSummary(sRes.data);
      setTxns(tRes.data || []);
    } catch (e) { toast.error("Diesel data load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season, selectedPump, filterDateFrom, filterDateTo, filterType, filterTruck]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddPump = async () => {
    if (!newPumpName.trim()) return;
    try {
      await axios.post(`${API}/diesel-pumps`, { name: newPumpName.trim(), is_default: pumps.length === 0 });
      toast.success("Pump add ho gaya!"); setNewPumpName(""); setShowAddPump(false); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const handleSetDefault = async (pumpId) => {
    try {
      await axios.put(`${API}/diesel-pumps/${pumpId}/set-default`);
      toast.success("Default pump set!"); fetchData();
    } catch (e) { toast.error("Error"); }
  };

  const handleDeletePump = async (pumpId) => {
    if (!window.confirm("Pump delete karein?")) return;
    try {
      await axios.delete(`${API}/diesel-pumps/${pumpId}`);
      toast.success("Pump deleted"); fetchData();
    } catch (e) { toast.error("Error"); }
  };

  const handlePay = async () => {
    const amt = parseFloat(payAmount);
    if (!payPumpId || !amt || amt <= 0) { toast.error("Pump aur amount bharein"); return; }
    try {
      await axios.post(`${API}/diesel-accounts/pay?username=${user.username}`, {
        pump_id: payPumpId, amount: amt, date: payDate,
        kms_year: filters.kms_year || "", season: filters.season || "", notes: payNotes
      });
      toast.success(`Rs.${amt} payment recorded!`);
      setShowPayDialog(false); setPayAmount(""); setPayNotes(""); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const handleDeleteTxn = async (id) => {
    if (!window.confirm("Transaction delete karein?")) return;
    try { await axios.delete(`${API}/diesel-accounts/${id}`); toast.success("Deleted"); setDieselSelectedIds(prev => prev.filter(x => x !== id)); fetchData(); }
    catch (e) { toast.error("Error"); }
  };

  const [dieselSelectedIds, setDieselSelectedIds] = useState([]);
  const handleDieselBulkDelete = async () => {
    if (dieselSelectedIds.length === 0) return;
    if (!window.confirm(`Kya aap ${dieselSelectedIds.length} transactions delete karna chahte hain?`)) return;
    try {
      await axios.post(`${API}/diesel-accounts/delete-bulk`, { ids: dieselSelectedIds });
      toast.success(`${dieselSelectedIds.length} transactions deleted!`);
      setDieselSelectedIds([]);
      fetchData();
    } catch (e) { toast.error("Bulk delete nahi hua"); }
  };
  const toggleDieselSelect = (id) => {
    setDieselSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleDieselSelectAll = () => {
    setDieselSelectedIds(prev => prev.length === txns.length ? [] : txns.map(t => t.id));
  };

  return (
    <div className="space-y-4" data-testid="diesel-account-tab">
      {/* Pump Management */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-slate-400 text-sm font-medium">Pumps:</span>
        {pumps.map(p => (
          <div key={p.id} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border ${p.is_default ? 'border-orange-500 bg-orange-900/20 text-orange-300' : 'border-slate-600 bg-slate-800 text-slate-300'}`}>
            {p.is_default && <Star className="w-3 h-3 text-orange-400 fill-orange-400" />}
            <span>{p.name}</span>
            {!p.is_default && user.role === 'admin' && (
              <button onClick={() => handleSetDefault(p.id)} className="text-[9px] text-slate-500 hover:text-orange-400 ml-1" title="Set as default">Default</button>
            )}
            {user.role === 'admin' && (
              <button onClick={() => handleDeletePump(p.id)} className="text-red-400 hover:text-red-300 ml-1"><Trash2 className="w-3 h-3" /></button>
            )}
          </div>
        ))}
        {user.role === 'admin' && !showAddPump && (
          <Button onClick={() => setShowAddPump(true)} variant="outline" size="sm" className="h-7 text-xs border-slate-600 text-slate-400" data-testid="add-pump-btn">
            <Plus className="w-3 h-3 mr-1" /> Add Pump
          </Button>
        )}
        {showAddPump && (
          <div className="flex items-center gap-1">
            <Input value={newPumpName} onChange={e => setNewPumpName(e.target.value)} placeholder="Pump name" className="h-7 w-40 bg-slate-700 border-slate-600 text-white text-xs" data-testid="new-pump-name" onKeyDown={e => e.key === 'Enter' && handleAddPump()} />
            <Button onClick={handleAddPump} size="sm" className="h-7 text-xs bg-orange-500 text-white">Save</Button>
            <Button onClick={() => setShowAddPump(false)} variant="ghost" size="sm" className="h-7 text-xs text-slate-400">X</Button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {summary.pumps?.map(p => (
            <Card key={p.pump_id} className={`border-slate-700 ${p.is_default ? 'bg-gradient-to-br from-orange-900/30 to-slate-800 border-orange-800/30' : 'bg-slate-800'}`}>
              <CardContent className="p-3">
                <div className="flex items-center gap-1 mb-1">
                  {p.is_default && <Star className="w-3 h-3 text-orange-400 fill-orange-400" />}
                  <p className="text-[10px] text-slate-400 truncate">{p.pump_name}</p>
                </div>
                <p className="text-lg font-bold text-red-400">Rs.{p.balance.toLocaleString('en-IN')}</p>
                <div className="flex gap-2 text-[10px] mt-1">
                  {p.opening_balance > 0 && <span className="text-yellow-400">OB: Rs.{p.opening_balance.toLocaleString('en-IN')}</span>}
                  <span className="text-orange-400">Diesel: Rs.{p.total_diesel.toLocaleString('en-IN')}</span>
                  <span className="text-green-400">Paid: Rs.{p.total_paid.toLocaleString('en-IN')}</span>
                </div>
                <p className="text-[9px] text-slate-500">{p.txn_count} entries</p>
                <Button onClick={() => { setPayPumpId(p.pump_id); setShowPayDialog(true); }} size="sm" className="mt-2 h-6 text-[10px] bg-emerald-600 hover:bg-emerald-700 w-full" data-testid={`pay-pump-${p.pump_id}`}>
                  <IndianRupee className="w-3 h-3 mr-0.5" /> Pay / Settle
                </Button>
              </CardContent>
            </Card>
          ))}
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-3">
              <p className="text-[10px] text-white font-medium">Grand Total</p>
              <p className="text-lg font-bold text-white">Rs.{(summary.grand_balance || 0).toLocaleString('en-IN')}</p>
              <div className="flex gap-2 text-[10px] mt-1">
                <span className="text-orange-400">Total: Rs.{(summary.grand_total_diesel || 0).toLocaleString('en-IN')}</span>
                <span className="text-green-400">Paid: Rs.{(summary.grand_total_paid || 0).toLocaleString('en-IN')}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-end">
        <div className="flex flex-col">
          <label className="text-[10px] text-slate-400 mb-0.5">From Date</label>
          <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
            className="h-8 w-36 bg-slate-700 border-slate-600 text-white text-xs" data-testid="diesel-filter-date-from" />
        </div>
        <div className="flex flex-col">
          <label className="text-[10px] text-slate-400 mb-0.5">To Date</label>
          <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
            className="h-8 w-36 bg-slate-700 border-slate-600 text-white text-xs" data-testid="diesel-filter-date-to" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-32 bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="diesel-filter-type">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="debit">Diesel</SelectItem>
            <SelectItem value="payment">Payment</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Truck No..." value={filterTruck} onChange={e => setFilterTruck(e.target.value)}
          className="h-8 w-36 bg-slate-700 border-slate-600 text-white text-xs" data-testid="diesel-filter-truck"
          onKeyDown={e => e.key === 'Enter' && fetchData()} />
        <Select value={selectedPump} onValueChange={setSelectedPump}>
          <SelectTrigger className="w-40 bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="diesel-pump-filter">
            <SelectValue placeholder="All Pumps" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Pumps</SelectItem>
            {pumps.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {(filterDateFrom || filterDateTo || filterType !== "all" || filterTruck) && (
          <Button onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); setFilterType("all"); setFilterTruck(""); }}
            variant="ghost" size="sm" className="h-8 text-xs text-red-400 hover:bg-slate-700" data-testid="diesel-clear-filters">
            Clear Filters
          </Button>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
        <Button onClick={async () => { try { const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season); const res = await axios.get(`${API}/diesel-accounts/excel?${p}`, { responseType: 'blob' }); const url = window.URL.createObjectURL(new Blob([res.data])); const a = document.createElement('a'); a.href = url; a.download = 'diesel_account.xlsx'; a.click(); } catch (e) { toast.error("Excel export failed"); } }} variant="outline" size="sm" className="border-slate-600 text-green-400 hover:bg-slate-700" data-testid="diesel-export-excel"><Download className="w-4 h-4 mr-1" /> Excel</Button>
        <Button onClick={async () => { try { const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season); const res = await axios.get(`${API}/diesel-accounts/pdf?${p}`, { responseType: 'blob' }); const url = window.URL.createObjectURL(new Blob([res.data])); const a = document.createElement('a'); a.href = url; a.download = 'diesel_account.pdf'; a.click(); } catch (e) { toast.error("PDF export failed"); } }} variant="outline" size="sm" className="border-slate-600 text-red-400 hover:bg-slate-700" data-testid="diesel-export-pdf"><FileText className="w-4 h-4 mr-1" /> PDF</Button>
      </div>

      {/* Transactions Table */}
      <Card className="bg-slate-800 border-slate-700">
        {user.role === 'admin' && dieselSelectedIds.length > 0 && (
          <div className="px-4 pt-3">
            <Button onClick={handleDieselBulkDelete} variant="destructive" size="sm" className="h-7 text-xs" data-testid="diesel-bulk-delete">
              <Trash2 className="w-3 h-3 mr-1" /> Delete Selected ({dieselSelectedIds.length})
            </Button>
          </div>
        )}
        <CardContent className="p-0"><div className="overflow-x-auto">
        <Table><TableHeader><TableRow className="border-slate-700 hover:bg-transparent">
          {user.role === 'admin' && (
            <TableHead className="w-8">
              <input type="checkbox" checked={txns.length > 0 && dieselSelectedIds.length === txns.length} onChange={toggleDieselSelectAll}
                className="rounded border-slate-600" data-testid="diesel-select-all" />
            </TableHead>
          )}
          {['Date','Pump','Type','Truck No','Mandi','Amount (Rs.)','Description',''].map(h =>
            <TableHead key={h} className={`text-slate-300 text-xs ${h === 'Amount (Rs.)' ? 'text-right' : ''}`}>{h}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          {loading ? <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
          : txns.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8">Koi transaction nahi hai.</TableCell></TableRow>
          : txns.map(t => (
            <TableRow key={t.id} className={`border-slate-700 ${t.txn_type === 'payment' ? 'bg-green-900/10' : 'bg-orange-900/5'} ${dieselSelectedIds.includes(t.id) ? 'ring-1 ring-orange-400' : ''}`} data-testid={`diesel-row-${t.id}`}>
              {user.role === 'admin' && (
                <TableCell className="w-8">
                  <input type="checkbox" checked={dieselSelectedIds.includes(t.id)} onChange={() => toggleDieselSelect(t.id)}
                    className="rounded border-slate-600" data-testid={`diesel-select-${t.id}`} />
                </TableCell>
              )}              <TableCell className="text-white text-xs">{fmtDate(t.date)}</TableCell>
              <TableCell className="text-slate-300 text-xs">{t.pump_name}</TableCell>
              <TableCell className="text-xs"><span className={t.txn_type === 'payment' ? 'text-green-400 font-medium' : 'text-orange-400'}>{t.txn_type === 'payment' ? 'PAYMENT' : 'DIESEL'}</span></TableCell>
              <TableCell className="text-slate-300 text-xs">{t.truck_no || '-'}</TableCell>
              <TableCell className="text-slate-300 text-xs">{t.mandi_name || t.agent_name || '-'}</TableCell>
              <TableCell className={`text-xs text-right font-medium ${t.txn_type === 'payment' ? 'text-green-400' : 'text-orange-400'}`}>{t.txn_type === 'payment' ? '-' : ''}Rs.{t.amount?.toLocaleString('en-IN')}</TableCell>
              <TableCell className="text-slate-500 text-xs max-w-[200px] truncate">{t.description}</TableCell>
              <TableCell>{user.role === 'admin' && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => handleDeleteTxn(t.id)}><Trash2 className="w-3 h-3" /></Button>}</TableCell>
            </TableRow>
          ))}
        </TableBody></Table>
      </div></CardContent></Card>

      {/* Payment Dialog */}
      <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-sm" data-testid="diesel-pay-dialog">
          <DialogHeader><DialogTitle className="text-emerald-400">Diesel Payment / Settlement</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs text-slate-400">Pump</Label>
              <Select value={payPumpId} onValueChange={setPayPumpId}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="diesel-pay-pump"><SelectValue placeholder="Select Pump" /></SelectTrigger>
                <SelectContent>{pumps.map(p => <SelectItem key={p.id} value={p.id}>{p.name} {p.is_default ? '(Default)' : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Amount (Rs.)</Label>
                <Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Amount" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="diesel-pay-amount" /></div>
              <div><Label className="text-xs text-slate-400">Date</Label>
                <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="diesel-pay-date" /></div>
            </div>
            <div><Label className="text-xs text-slate-400">Notes</Label>
              <Input value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Optional notes" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="diesel-pay-notes" /></div>
            {payPumpId && summary?.pumps && (() => {
              const ps = summary.pumps.find(p => p.pump_id === payPumpId);
              return ps ? <p className="text-xs text-slate-400">Pending: <span className="text-red-400 font-bold">Rs.{ps.balance.toLocaleString('en-IN')}</span></p> : null;
            })()}
            <div className="flex gap-2">
              <Button onClick={handlePay} className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1" data-testid="diesel-pay-submit">
                <IndianRupee className="w-4 h-4 mr-1" /> Pay
              </Button>
              <Button variant="outline" onClick={() => setShowPayDialog(false)} className="border-slate-600 text-slate-300">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Main App Component

export default Payments;
