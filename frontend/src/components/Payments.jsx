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
  Truck, Users, IndianRupee, CheckCircle, Clock, AlertCircle, AlertTriangle, ArrowRightCircle, Undo2, History,
  Target, Download, FileText, FileSpreadsheet, Printer, X, Edit, Fuel, Trash2, RefreshCw, Handshake, Package, Send,
} from "lucide-react";
import LocalPartyAccount from "./payments/LocalPartyAccount";
import DieselAccount from "./payments/DieselAccount";
import { SendToGroupDialog } from "./SendToGroupDialog";
import { useMessagingEnabled } from "../hooks/useMessagingEnabled";

import LeasedTruck from "./LeasedTruck";
import { MSPPayments } from "./DCTracker";
import { useConfirm } from "./ConfirmProvider";
import RoundOffInput from "./common/RoundOffInput";
const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

// Safe print helper - uses iframe approach (works in Electron + browser)
const _isElectronEnv = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);

import { safePrintHTML } from "../utils/print";
import logger from "../utils/logger";

export const Payments = ({ filters, user, branding, initialSubTab, onSubTabConsumed }) => {
  const showConfirm = useConfirm();
  const { wa } = useMessagingEnabled();
  const [truckPayments, setTruckPayments] = useState([]);
  const [agentPayments, setAgentPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePaymentTab, setActivePaymentTab] = useState("truck");

  // Handle navigation from QuickSearch with subtab
  useEffect(() => {
    if (initialSubTab) {
      setActivePaymentTab(initialSubTab);
      if (onSubTabConsumed) onSubTabConsumed();
    }
  }, [initialSubTab, onSubTabConsumed]);

  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showRateDialog, setShowRateDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentRoundOff, setPaymentRoundOff] = useState("");
  const [paymentAccount, setPaymentAccount] = useState("cash");
  const [paymentBankName, setPaymentBankName] = useState("");
  const [paymentOwnerName, setPaymentOwnerName] = useState("");
  const [bankAccounts, setBankAccounts] = useState([]);
  const [ownerAccounts, setOwnerAccounts] = useState([]);
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
  const [ownerPayRoundOff, setOwnerPayRoundOff] = useState("");
  const [ownerHistory, setOwnerHistory] = useState([]);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupText, setGroupText] = useState("");
  const [groupPdfUrl, setGroupPdfUrl] = useState("");
  // Move-to-Pvt (excess agent delivery → pvt purchase)
  const [movePvtDialog, setMovePvtDialog] = useState({ open: false, payment: null });
  const [movePvtRate, setMovePvtRate] = useState("");

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.kms_year) params.append('kms_year', filters.kms_year);

      const [truckRes, agentRes] = await Promise.all([
        axios.get(`${API}/truck-payments?${params.toString()}`),
        axios.get(`${API}/agent-payments?${params.toString()}`)
      ]);

      setTruckPayments(truckRes.data || []);
      setAgentPayments(agentRes.data || []);
    } catch (error) {
      logger.error("Payments fetch error:", error);
      toast.error("Payments load karne mein error");
    } finally {
      setLoading(false);
    }
  }, [filters.kms_year]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Load bank + owner accounts for the payment dialog selector
  useEffect(() => {
    (async () => {
      try { const r = await axios.get(`${API}/bank-accounts`); setBankAccounts(r.data || []); } catch (e) { /* ignore */ }
      try { const r = await axios.get(`${API}/owner-accounts`); setOwnerAccounts(r.data || []); } catch (e) { /* ignore */ }
    })();
  }, []);

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
    
    if (truckSearchFilter) params.append('truck_no', truckSearchFilter);
    const { downloadFile } = await import('../utils/download');
    downloadFile(`/api/export/truck-payments-excel?${params.toString()}`, 'truck_payments.xlsx');
  };

  // Export truck payments to PDF
  const handleExportTruckPDF = async () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    
    if (truckSearchFilter) params.append('truck_no', truckSearchFilter);
    const { downloadFile } = await import('../utils/download');
    downloadFile(`/api/export/truck-payments-pdf?${params.toString()}`, 'truck_payments.pdf');
  };

  // Export agent payments
  const handleExportAgentExcel = async () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    
    const { downloadFile } = await import('../utils/download');
    downloadFile(`/api/export/agent-payments-excel?${params.toString()}`, 'agent_payments.xlsx');
  };

  const handleExportAgentPDF = async () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    
    const { downloadFile } = await import('../utils/download');
    downloadFile(`/api/export/agent-payments-pdf?${params.toString()}`, 'agent_payments.pdf');
  };

  // Move excess agent delivery (TP > target+cutting%) to Pvt Paddy Purchase ledger
  const handleMoveToPvt = async () => {
    const rate = parseFloat(movePvtRate);
    if (!rate || rate <= 0) { toast.error("Pvt rate (Rs./Q) daalein"); return; }
    const p = movePvtDialog.payment;
    if (!p || !p.excess_weight || p.excess_weight <= 0) { toast.error("Koi extra QNTL nahi"); return; }
    try {
      const res = await axios.post(`${API}/reports/agent-mandi-wise/move-to-pvt`, {
        mandi_name: p.mandi_name, agent_name: p.agent_name,
        extra_qntl: p.excess_weight, rate,
        kms_year: p.kms_year || filters.kms_year, season: p.season || "Kharif",
        username: user.username || "admin",
      });
      if (res.data.success) {
        toast.success(res.data.message || `${p.excess_weight}Q moved to Pvt Purchase`);
        setMovePvtDialog({ open: false, payment: null });
        setMovePvtRate("");
        fetchPayments();
      } else {
        toast.error(res.data.detail || "Move failed");
      }
    } catch (e) { toast.error(e.response?.data?.detail || "Move failed"); }
  };

  // Export Truck Owner Consolidated
  const handleExportTruckOwnerExcel = async () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    
    const { downloadFile } = await import('../utils/download');
    downloadFile(`/api/export/truck-owner-excel?${params.toString()}`, 'truck_owner.xlsx');
  };

  const handleExportTruckOwnerPDF = async () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    
    const { downloadFile } = await import('../utils/download');
    downloadFile(`/api/export/truck-owner-pdf?${params.toString()}`, 'truck_owner.pdf');
  };

  // WhatsApp - Truck Payment (individual trip)
  const handleWhatsAppTruckPayment = async (payment) => {
    try {
      let waSettings;
      try { waSettings = (await axios.get(`${API}/whatsapp/settings`)).data; } catch(e) { waSettings = {}; }
      const hasDefaults = (waSettings.default_numbers || []).length > 0;
      let phone = "";
      if (!hasDefaults) {
        phone = prompt("WhatsApp number daalein (default numbers set nahi hain):");
        if (!phone) return;
      }
      // Desktop pe pdf_url local path hoga - backend file.io pe upload karega
      const pdfParams = new URLSearchParams();
      if (filters.kms_year) pdfParams.append('kms_year', filters.kms_year);
      
      pdfParams.append('truck_no', payment.truck_no);
      const pdfUrl = `${API}/export/truck-payments-pdf?${pdfParams.toString()}`;
      const res = await axios.post(`${API}/whatsapp/send-truck-payment`, {
        truck_no: payment.truck_no,
        payments: [{ date: fmtDate(payment.date), mandi_name: payment.mandi_name, net_amount: payment.net_amount }],
        total_net: payment.net_amount,
        total_paid: payment.paid_amount,
        total_balance: payment.balance_amount,
        pdf_url: pdfUrl,
        phone
      });
      if (res.data.success) toast.success(res.data.message || "WhatsApp bhej diya!");
      else toast.error(res.data.error || res.data.message || "WhatsApp fail");
    } catch (e) { toast.error("WhatsApp error: " + (e.response?.data?.detail || e.response?.data?.error || e.message)); }
  };

  // WhatsApp - Truck Owner (consolidated)
  const handleWhatsAppTruckOwner = async (truckData) => {
    try {
      let waSettings;
      try { waSettings = (await axios.get(`${API}/whatsapp/settings`)).data; } catch(e) { waSettings = {}; }
      const hasDefaults = (waSettings.default_numbers || []).length > 0;
      let phone = "";
      if (!hasDefaults) {
        phone = prompt("WhatsApp number daalein (default numbers set nahi hain):");
        if (!phone) return;
      }
      const pdfParams = new URLSearchParams();
      pdfParams.append('truck_no', truckData.truck_no);  // filter PDF to ONLY this truck
      if (filters.kms_year) pdfParams.append('kms_year', filters.kms_year);
      if (filters.season) pdfParams.append('season', filters.season);
      
      const pdfUrl = `${API}/export/truck-owner-pdf?${pdfParams.toString()}`;
      const res = await axios.post(`${API}/whatsapp/send-truck-owner`, {
        truck_no: truckData.truck_no,
        total_trips: truckData.trips.length,
        total_gross: truckData.total_gross,
        total_deductions: truckData.total_deductions,
        total_net: truckData.total_net,
        total_paid: truckData.total_paid,
        total_balance: truckData.total_balance,
        pdf_url: pdfUrl,
        phone
      });
      if (res.data.success) toast.success(res.data.message || "WhatsApp bhej diya!");
      else toast.error(res.data.error || res.data.message || "WhatsApp fail");
    } catch (e) { toast.error("WhatsApp error: " + (e.response?.data?.detail || e.response?.data?.error || e.message)); }
  };

  // Undo paid
  const handleUndoPaid = async (item) => {
    if (!await showConfirm("Undo Payment", "Kya aap is payment ko undo karna chahte hain? Paid amount 0 ho jayega.")) return;
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
      const params = `kms_year=${filters.kms_year||''}&username=${user.username}&role=${user.role}`;
      const res = await axios.post(`${API}/truck-owner/${encodeURIComponent(selectedOwnerTruck.truck_no)}/pay?${params}`, {
        amount: parseFloat(ownerPayAmount), note: ownerPayNote, payment_mode: ownerPayMode,
        round_off: parseFloat(ownerPayRoundOff) || 0,
      });
      toast.success(res.data.message);
      setShowOwnerPayDialog(false); setOwnerPayAmount(""); setOwnerPayNote(""); setOwnerPayMode("cash"); setOwnerPayRoundOff("");
      fetchPayments();
    } catch (e) { toast.error(e.response?.data?.detail || "Payment error"); }
  };

  const handleOwnerMarkPaid = async (truck) => {
    if (!await showConfirm("Mark All Paid", `${truck.truck_no} ke saare trips mark paid karna chahte hain?`)) return;
    try {
      const params = `kms_year=${filters.kms_year||''}&username=${user.username}&role=${user.role}`;
      const res = await axios.post(`${API}/truck-owner/${encodeURIComponent(truck.truck_no)}/mark-paid?${params}`);
      toast.success(res.data.message); fetchPayments();
    } catch (e) { toast.error(e.response?.data?.detail || "Mark paid error"); }
  };

  const handleOwnerUndoPaid = async (truck) => {
    if (!await showConfirm("Undo All Payments", `${truck.truck_no} ke saare payments undo karna chahte hain?`)) return;
    try {
      const params = `kms_year=${filters.kms_year||''}&username=${user.username}&role=${user.role}`;
      const res = await axios.post(`${API}/truck-owner/${encodeURIComponent(truck.truck_no)}/undo-paid?${params}`);
      toast.success(res.data.message); fetchPayments();
    } catch (e) { toast.error(e.response?.data?.detail || "Undo error"); }
  };

  const handleOwnerHistory = async (truck) => {
    try {
      const res = await axios.get(`${API}/truck-owner/${encodeURIComponent(truck.truck_no)}/history?kms_year=${filters.kms_year||''}`);
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
          `${API}/agent-rates/${encodeURIComponent(selectedItem.agent_name)}?kms_year=${filters.kms_year}&username=${user.username}&role=${user.role}`,
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
    if (paymentAccount === 'bank' && !paymentBankName) { toast.error("Bank select karein"); return; }
    if (paymentAccount === 'owner' && !paymentOwnerName) { toast.error("Owner account select karein"); return; }
    try {
      const roundOff = parseFloat(paymentRoundOff) || 0;
      const payload = {
        amount: parseFloat(paymentAmount), note: paymentNote, round_off: roundOff,
        account: paymentAccount,
        bank_name: paymentAccount === 'bank' ? paymentBankName : "",
        owner_name: paymentAccount === 'owner' ? paymentOwnerName : "",
      };
      if (activePaymentTab === "truck") {
        await axios.post(
          `${API}/truck-payments/${selectedItem.entry_id}/pay?username=${user.username}&role=${user.role}`,
          payload
        );
      } else {
        await axios.post(
          `${API}/agent-payments/${encodeURIComponent(selectedItem.mandi_name)}/pay?kms_year=${selectedItem.kms_year}&season=${selectedItem.season}&username=${user.username}&role=${user.role}`,
          payload
        );
      }
      toast.success("Payment recorded!");
      setShowPaymentDialog(false);
      setPaymentAmount("");
      setPaymentNote("");
      setPaymentRoundOff("");
      setPaymentAccount("cash");
      setPaymentBankName("");
      setPaymentOwnerName("");
      fetchPayments();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Payment karne mein error");
    }
  };

  const handleMarkPaid = async (item) => {
    if (!await showConfirm("Mark Paid", "Kya aap isko fully paid mark karna chahte hain?")) return;
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
            <p>TP Weight: ${payment.tp_weight_qntl || 0} QNTL | Achieved: ${payment.achieved_qntl} QNTL</p>
            <p>Excess/Minus Weight: ${payment.excess_weight > 0 ? '+' : ''}${payment.excess_weight || 0} QNTL ${payment.is_target_complete ? '✅ Complete' : '⏳ In Progress'}</p>
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
  const truckWiseConsolidated = useMemo(() => filteredTruckPayments.reduce((acc, payment) => {
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
  }, {}), [filteredTruckPayments]);

  const consolidatedTruckList = useMemo(() => Object.values(truckWiseConsolidated), [truckWiseConsolidated]);
  const consolidatedTotals = useMemo(() => ({
    net: consolidatedTruckList.reduce((sum, t) => sum + t.total_net, 0),
    paid: consolidatedTruckList.reduce((sum, t) => sum + t.total_paid, 0),
    balance: consolidatedTruckList.reduce((sum, t) => sum + t.total_balance, 0),
  }), [consolidatedTruckList]);

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

  // Calculate totals for filtered truck payments (memoized)
  const truckTotals = useMemo(() => ({
    netAmount: filteredTruckPayments.reduce((sum, p) => sum + p.net_amount, 0),
    paid: filteredTruckPayments.reduce((sum, p) => sum + p.paid_amount, 0),
    balance: filteredTruckPayments.reduce((sum, p) => sum + p.balance_amount, 0)
  }), [filteredTruckPayments]);

  const agentTotals = useMemo(() => ({
    totalAmount: agentPayments.reduce((sum, p) => sum + p.total_amount, 0),
    paid: agentPayments.reduce((sum, p) => sum + p.paid_amount, 0),
    balance: agentPayments.reduce((sum, p) => sum + p.balance_amount, 0)
  }), [agentPayments]);

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
        <Button
          onClick={() => setActivePaymentTab("msp-payments")}
          variant={activePaymentTab === "msp-payments" ? "default" : "ghost"}
          size="sm"
          className={activePaymentTab === "msp-payments" 
            ? "bg-emerald-500 hover:bg-emerald-600 text-white" 
            : "text-slate-300 hover:bg-slate-700"}
          data-testid="tab-msp-payments"
        >
          <Truck className="w-4 h-4 mr-1" />
          MSP Payments
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
                    <TableRow key={payment.entry_id || `truck-${idx}`} className="border-slate-700 hover:bg-slate-700/50">
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
                            {wa && <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleWhatsAppTruckPayment(payment)}
                              className="h-7 px-2 text-green-400 hover:bg-green-900/30"
                              title="WhatsApp Send"
                              data-testid={`truck-wa-${idx}`}
                            >
                              <Send className="w-3 h-3" />
                            </Button>}
                            {wa && <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-teal-400 hover:bg-teal-900/30"
                              title="Send to Group"
                              data-testid={`truck-group-${idx}`}
                              onClick={() => {
                                setGroupText(`*Truck Payment / ट्रक भुगतान*\nTruck: *${payment.truck_no}*\nMandi: ${payment.mandi_name || ''}\nNet: Rs.${(payment.net_amount || 0).toLocaleString()}\nPaid: Rs.${(payment.paid_amount || 0).toLocaleString()}\n*Balance: Rs.${(payment.balance || 0).toLocaleString()}*`);
                                setGroupPdfUrl("");
                                setGroupDialogOpen(true);
                              }}
                            >
                              <Users className="w-3 h-3" />
                            </Button>}
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
                      <TableHead className="text-slate-300 text-right">Total Final W</TableHead>
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
                      <TableRow key={truckData.truck_no || `cons-${idx}`} className="border-slate-700 hover:bg-slate-700/50">
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
                          <div className="flex gap-1 items-center">
                            {user.role === 'admin' && truckData.status !== 'paid' && (
                              <>
                                <Button size="sm" variant="ghost"
                                  title="Make Payment"
                                  onClick={() => { setSelectedOwnerTruck(truckData); setOwnerPayAmount(""); setOwnerPayNote(""); setShowOwnerPayDialog(true); }}
                                  className="h-7 w-7 p-0 text-emerald-400 hover:bg-emerald-900/30 border border-emerald-600"
                                  data-testid={`owner-pay-${idx}`}>
                                  <IndianRupee className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost"
                                  title="Mark Paid"
                                  onClick={() => handleOwnerMarkPaid(truckData)}
                                  className="h-7 w-7 p-0 text-blue-400 hover:bg-blue-900/30 border border-blue-600"
                                  data-testid={`owner-markpaid-${idx}`}>
                                  <CheckCircle className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                            {user.role === 'admin' && truckData.status !== 'pending' && (
                              <Button size="sm" variant="ghost"
                                title="Undo Paid"
                                onClick={() => handleOwnerUndoPaid(truckData)}
                                className="h-7 w-7 p-0 text-orange-400 hover:bg-orange-900/30 border border-orange-600"
                                data-testid={`owner-undo-${idx}`}>
                                <Undo2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost"
                              title="Payment History"
                              onClick={() => handleOwnerHistory(truckData)}
                              className="h-7 w-7 p-0 text-purple-400 hover:bg-purple-900/30 border border-purple-600"
                              data-testid={`owner-history-${idx}`}>
                              <History className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost"
                              title="Print Invoice"
                              onClick={() => handlePrintConsolidatedInvoice(truckData)}
                              className="h-7 w-7 p-0 text-cyan-400 hover:bg-cyan-900/30 border border-cyan-600">
                              <Printer className="w-3.5 h-3.5" />
                            </Button>
                            {wa && <Button size="sm" variant="ghost"
                              title="Send on WhatsApp"
                              onClick={() => handleWhatsAppTruckOwner(truckData)}
                              className="h-7 w-7 p-0 text-green-400 hover:bg-green-900/30 border border-green-600"
                              data-testid={`owner-wa-${idx}`}>
                              <Send className="w-3.5 h-3.5" />
                            </Button>}
                            {wa && <Button size="sm" variant="ghost"
                              title="Send to Group"
                              className="h-7 w-7 p-0 text-teal-400 hover:bg-teal-900/30 border border-teal-600"
                              data-testid={`owner-group-${idx}`}
                              onClick={() => {
                                setGroupText(`*Truck Owner Payment / ट्रक मालिक भुगतान*\nTruck: *${truckData.truck_no}*\nTrips: ${truckData.total_trips || 0}\nNet: Rs.${(truckData.total_net || 0).toLocaleString()}\nPaid: Rs.${(truckData.total_paid || 0).toLocaleString()}\n*Balance: Rs.${(truckData.total_balance || 0).toLocaleString()}*`);
                                // Pass truck_no so PDF only contains THIS truck (not all trucks)
                                const pdfParams = new URLSearchParams();
                                pdfParams.append('truck_no', truckData.truck_no);
                                if (filters.kms_year) pdfParams.append('kms_year', filters.kms_year);
                                if (filters.season) pdfParams.append('season', filters.season);
                                setGroupPdfUrl(`${API}/export/truck-owner-pdf?${pdfParams.toString()}`);
                                setGroupDialogOpen(true);
                              }}>
                              <Users className="w-3.5 h-3.5" />
                            </Button>}
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
                        ₹{consolidatedTotals.net.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs">Total Paid</p>
                      <p className="text-emerald-400 font-bold text-xl">
                        ₹{consolidatedTotals.paid.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs">Total Balance</p>
                      <p className="text-red-400 font-bold text-xl">
                        ₹{consolidatedTotals.balance.toLocaleString()}
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
                      <TableHead className="text-slate-300 text-right">TP Weight</TableHead>
                      <TableHead className="text-slate-300 text-right">Achieved</TableHead>
                      <TableHead className="text-slate-300 text-right">Excess Wt</TableHead>
                      <TableHead className="text-slate-300 text-right">Paid</TableHead>
                      <TableHead className="text-slate-300 text-right">Balance</TableHead>
                      <TableHead className="text-slate-300">Status</TableHead>
                      {user.role === 'admin' && <TableHead className="text-slate-300">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentPayments.map((payment, idx) => (
                      <TableRow key={`${payment.mandi_name}-${payment.agent_name}-${idx}`} className="border-slate-700 hover:bg-slate-700/50">
                        <TableCell className="text-white font-semibold">
                          {payment.mandi_name}
                          {payment.is_capped && (
                            <div
                              className="text-[10px] mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-900/30 border border-amber-700/40 text-amber-300"
                              title={`Capped: TP weight ${payment.tp_weight_qntl}Q exceeded contracted scope ${payment.cap_qntl}Q (target + cutting%). Extra ${(payment.tp_weight_qntl - payment.cap_qntl).toFixed(1)}Q earns no commission — move to Pvt Purchase.`}
                              data-testid={`capped-badge-${idx}`}
                            >
                              <AlertTriangle className="w-3 h-3" />
                              Capped @ {payment.cap_qntl}Q
                            </div>
                          )}
                        </TableCell>
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
                        <TableCell className="text-right text-cyan-400">{payment.tp_weight_qntl || 0} QNTL</TableCell>
                        <TableCell className="text-right">
                          <span className={payment.is_target_complete ? 'text-emerald-400' : 'text-amber-400'}>
                            {payment.achieved_qntl} QNTL
                          </span>
                          {payment.is_target_complete && <CheckCircle className="w-3 h-3 inline ml-1 text-emerald-400" />}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={payment.excess_weight >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {payment.excess_weight > 0 ? '+' : ''}{payment.excess_weight || 0} QNTL
                          </span>
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
                              {payment.excess_weight > 0 && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { setMovePvtDialog({ open: true, payment }); setMovePvtRate(""); }}
                                  className="h-7 px-2 text-orange-400 hover:bg-orange-900/30"
                                  title={`Move ${payment.excess_weight}Q extra delivery to Pvt Paddy Purchase`}
                                  data-testid={`move-to-pvt-btn-${idx}`}
                                >
                                  <ArrowRightCircle className="w-3 h-3" />
                                </Button>
                              )}
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
                {paymentHistory.map((record, idx) => {
                  const type = record.type || 'Payment';
                  const typeColor = type === 'Cash' ? 'bg-blue-900/40 text-blue-300 border-blue-600/40'
                    : type === 'Diesel' ? 'bg-amber-900/40 text-amber-300 border-amber-600/40'
                    : 'bg-emerald-900/40 text-emerald-300 border-emerald-600/40';
                  return (
                  <div
                    key={record.id || record.date || `hist-${idx}`}
                    className={`p-3 rounded-lg border ${
                      record.amount < 0
                        ? 'bg-red-900/20 border-red-600/50'
                        : 'bg-slate-700/50 border-slate-600'
                    }`}
                    data-testid={`history-row-${idx}`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${typeColor}`} data-testid={`history-type-${idx}`}>
                            {type}
                          </span>
                          <p className={`font-bold ${record.amount < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            {record.amount < 0 ? '' : '+'}₹{Math.abs(record.amount).toLocaleString()}
                          </p>
                        </div>
                        <p className="text-slate-400 text-xs break-words">{record.note || 'Payment'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-slate-400 text-xs">
                          {record.date ? new Date(record.date).toLocaleDateString('hi-IN') : '-'}
                        </p>
                        <p className="text-slate-500 text-xs">by {record.by || 'system'}</p>
                      </div>
                    </div>
                  </div>
                  );
                })}
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
      {activePaymentTab === "leased-truck" && <LeasedTruck filters={filters} />}
      {activePaymentTab === "msp-payments" && <MSPPayments filters={filters} user={user} />}

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
              <Label className="text-slate-300">Payment Account</Label>
              <Select value={paymentAccount === 'owner' && paymentOwnerName ? `owner:${paymentOwnerName}` : paymentAccount === 'bank' && paymentBankName ? `bank:${paymentBankName}` : paymentAccount}
                onValueChange={(v) => {
                  if (v.startsWith('owner:')) { setPaymentAccount('owner'); setPaymentOwnerName(v.slice(6)); setPaymentBankName(""); }
                  else if (v.startsWith('bank:')) { setPaymentAccount('bank'); setPaymentBankName(v.slice(5)); setPaymentOwnerName(""); }
                  else { setPaymentAccount(v); setPaymentBankName(""); setPaymentOwnerName(""); }
                }}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white" data-testid="payment-account-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash (नकद)</SelectItem>
                  {bankAccounts.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-indigo-400 font-semibold border-t mt-1">Bank Accounts</div>
                      {bankAccounts.map(b => (<SelectItem key={b.id} value={`bank:${b.bank_name}`}>{b.bank_name}</SelectItem>))}
                    </>
                  )}
                  {ownerAccounts.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-amber-400 font-semibold border-t mt-1">Owner Accounts</div>
                      {ownerAccounts.map(o => (<SelectItem key={o.id} value={`owner:${o.name}`}>{o.name} <span className="text-[10px] text-amber-400 ml-1">(मालिक)</span></SelectItem>))}
                    </>
                  )}
                </SelectContent>
              </Select>
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
            <RoundOffInput
              value={paymentRoundOff}
              onChange={setPaymentRoundOff}
              amount={parseFloat(paymentAmount) || 0}
            />
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

      {/* Move-to-Pvt (excess agent delivery → Pvt Paddy Purchase) */}
      <Dialog open={movePvtDialog.open} onOpenChange={(o) => { if (!o) { setMovePvtDialog({ open: false, payment: null }); setMovePvtRate(""); } }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md" data-testid="move-to-pvt-dialog">
          <DialogHeader>
            <DialogTitle className="text-orange-400 flex items-center gap-2">
              <ArrowRightCircle className="w-5 h-5" /> Move to Pvt Paddy Purchase
            </DialogTitle>
          </DialogHeader>
          {movePvtDialog.payment && (
            <div className="space-y-3">
              <div className="rounded border border-amber-700/40 bg-amber-900/20 p-3 text-sm">
                <div className="text-amber-300 font-semibold mb-1">{movePvtDialog.payment.mandi_name} — {movePvtDialog.payment.agent_name}</div>
                <div className="text-slate-300 text-xs space-y-0.5">
                  <div>Govt Target: <span className="text-white">{movePvtDialog.payment.target_qntl} Q</span></div>
                  <div>Cap (Target + {movePvtDialog.payment.cutting_percent}%): <span className="text-white">{movePvtDialog.payment.cap_qntl} Q</span></div>
                  <div>Agent Delivered (TP): <span className="text-cyan-400">{movePvtDialog.payment.tp_weight_qntl} Q</span></div>
                  <div className="pt-1 border-t border-amber-700/30">
                    <span className="text-orange-300 font-bold">Extra to move: {movePvtDialog.payment.excess_weight} Q</span>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-slate-300 text-xs">Pvt Rate (Rs./QNTL) <span className="text-red-400">*</span></Label>
                <Input
                  type="number" inputMode="decimal" value={movePvtRate}
                  onChange={(e) => setMovePvtRate(e.target.value)}
                  placeholder="e.g. 1850"
                  className="bg-slate-700 border-slate-600 text-white mt-1"
                  data-testid="move-to-pvt-rate"
                />
                {movePvtRate && parseFloat(movePvtRate) > 0 && (
                  <div className="text-xs text-emerald-400 mt-1">
                    Total amount: ₹{(parseFloat(movePvtRate) * (movePvtDialog.payment.excess_weight || 0)).toLocaleString('en-IN')}
                  </div>
                )}
              </div>
              <Button
                onClick={handleMoveToPvt}
                disabled={!movePvtRate || parseFloat(movePvtRate) <= 0}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                data-testid="move-to-pvt-submit"
              >
                Move {movePvtDialog.payment.excess_weight}Q to Pvt Purchase
              </Button>
            </div>
          )}
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
            <RoundOffInput
              value={ownerPayRoundOff}
              onChange={setOwnerPayRoundOff}
              amount={parseFloat(ownerPayAmount) || 0}
            />
            <Button onClick={handleOwnerPay} disabled={!ownerPayAmount || parseFloat(ownerPayAmount) <= 0}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="owner-pay-submit">
              Pay ₹{ownerPayAmount ? parseFloat(ownerPayAmount).toLocaleString() : '0'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Truck Owner History Dialog */}
      <Dialog open={showOwnerHistoryDialog} onOpenChange={setShowOwnerHistoryDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-purple-400">Payment History - {selectedOwnerTruck?.truck_no}</DialogTitle>
          </DialogHeader>
          {(() => {
            const totals = ownerHistory.reduce((acc, h) => {
              if (h.kind === 'cash') acc.cash += Number(h.amount) || 0;
              else if (h.kind === 'diesel') acc.diesel += Number(h.amount) || 0;
              else acc.payment += Number(h.amount) || 0;
              return acc;
            }, { cash: 0, diesel: 0, payment: 0 });
            return (
              <div className="grid grid-cols-3 gap-2 mb-3" data-testid="owner-history-totals">
                <div className="bg-amber-900/20 border border-amber-700/40 rounded p-2 text-center">
                  <div className="text-amber-300 text-[10px] uppercase tracking-wide">Cash Advance</div>
                  <div className="text-amber-400 font-bold">₹{totals.cash.toLocaleString()}</div>
                </div>
                <div className="bg-blue-900/20 border border-blue-700/40 rounded p-2 text-center">
                  <div className="text-blue-300 text-[10px] uppercase tracking-wide">Diesel Advance</div>
                  <div className="text-blue-400 font-bold">₹{totals.diesel.toLocaleString()}</div>
                </div>
                <div className="bg-emerald-900/20 border border-emerald-700/40 rounded p-2 text-center">
                  <div className="text-emerald-300 text-[10px] uppercase tracking-wide">Payments Paid</div>
                  <div className="text-emerald-400 font-bold">₹{totals.payment.toLocaleString()}</div>
                </div>
              </div>
            );
          })()}
          <div className="max-h-96 overflow-y-auto space-y-2">
            {ownerHistory.length === 0 ? (
              <p className="text-slate-400 text-center py-4" data-testid="owner-history-empty">Koi payment history nahi hai</p>
            ) : ownerHistory.map((h, idx) => {
              const kind = h.kind || 'payment';
              const styles = kind === 'cash'
                ? { bg: 'bg-amber-900/20', border: 'border-amber-700/40', text: 'text-amber-400', label: 'CASH', Icon: IndianRupee }
                : kind === 'diesel'
                ? { bg: 'bg-blue-900/20', border: 'border-blue-700/40', text: 'text-blue-400', label: 'DIESEL', Icon: Fuel }
                : { bg: 'bg-emerald-900/20', border: 'border-emerald-700/40', text: 'text-emerald-400', label: 'PAYMENT', Icon: CheckCircle };
              const Icon = styles.Icon;
              return (
                <div
                  key={h.id || `${h.date}-${idx}`}
                  className={`p-2.5 rounded border text-sm ${styles.bg} ${styles.border}`}
                  data-testid={`owner-history-row-${idx}`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${styles.text}`} />
                      <span className={`font-bold ${styles.text}`}>
                        ₹{Math.abs(Number(h.amount) || 0).toLocaleString()}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${styles.text} bg-slate-900/60 border ${styles.border}`}>
                        {styles.label}
                      </span>
                    </div>
                    <span className="text-slate-500 text-xs">
                      {h.date ? new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                    </span>
                  </div>
                  <div className="text-slate-400 text-xs mt-1">
                    {h.note || '—'} {h.by ? <span className="text-slate-500">| by {h.by}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
      <SendToGroupDialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen} text={groupText} pdfUrl={groupPdfUrl} />
    </div>
  );
};

// Main App Component

export default Payments;
