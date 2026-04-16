import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  RefreshCw, Filter, FileSpreadsheet, FileText, LogOut, User, Key,
  Calendar, Users, Keyboard, Info, Sun, Moon, Send, Search, ChevronDown, ExternalLink, Copy,
} from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import axios from "axios";
import SessionIndicator from "@/components/SessionIndicator";
import { ShortcutsDialog, BackupReminderDialog, PasswordChangeDialog } from "@/components/entries/HeaderDialogs";
import QuickSearch from "@/components/QuickSearch";
import SearchDetailDialog from "@/components/SearchDetailDialog";
import { TabNavigation } from "@/components/entries/TabNavigation";
import { FilterPanel } from "@/components/entries/FilterPanel";
import { MillEntryForm } from "@/components/entries/MillEntryForm";
import ExcelImport from "@/components/ExcelImport";
import { FY_YEARS } from "@/utils/constants";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

export const AppHeader = ({
  // Branding & user
  branding, user, onLogout, APP_VERSION,
  // Theme
  theme, toggleTheme,
  // Filters
  filters, setFilters, showFilters, setShowFilters, hasActiveFilters, clearFilters, handleFyChange,
  // Entries
  activeTab, setActiveTabSafe, entriesSubTab,
  fetchEntries, fetchTotals,
  // Dialog state
  showShortcuts, setShowShortcuts, showBackupReminder, setShowBackupReminder,
  handleCreateBackup, backupLoading,
  isPasswordDialogOpen, setIsPasswordDialogOpen, passwordData, setPasswordData, handlePasswordChange,
  quickSearchOpen, setQuickSearchOpen,
  searchDetailItem, setSearchDetailItem,
  setPaymentsInitSubTab, navigateToMillEntry,
  showWhatsNew, setShowWhatsNew,
  // Action bar props
  isDialogOpen, setIsDialogOpen, editingId,
  formData, setFormData, calculatedFields,
  leasedTruckNos, truckSuggestions, agentSuggestions, mandiSuggestions,
  openNewEntryDialog, handleSubmit, handleInputChange, debouncedRstLookup,
  handleAgentSelect, findMandiCutting, rstFetched,
  handleExportExcel, handleExportPDF,
  handleEntriesWhatsApp, handleEntriesGroupSend, handleEntriesTelegram, entriesTgSending,
  wa, tg,
}) => {
  const [govtLinks, setGovtLinks] = useState([]);
  useEffect(() => {
    axios.get(`${API}/govt-links`).then(r => setGovtLinks(r.data || [])).catch(() => {});
  }, []);

  const openGovtLink = (link) => {
    let url = link.url;
    if (link.username || link.password) {
      const sep = url.includes('?') ? '&' : '?';
      const params = new URLSearchParams();
      if (link.username) params.append('username', link.username);
      if (link.password) params.append('password', link.password);
      url = `${url}${sep}${params.toString()}`;
    }
    window.open(url, '_blank');
    if (link.username) {
      navigator.clipboard?.writeText(link.username).then(() => {
        toast.success(`Username "${link.username}" clipboard mein copy ho gaya!`);
      }).catch(() => {});
    }
  };

  return (
    <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-10 no-print">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-amber-400 truncate" data-testid="app-title">
              {branding.company_name}
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm truncate hidden sm:block">{branding.tagline}</p>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Global FY Selector */}
            <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-amber-900/30 border border-amber-700/50 rounded-lg" data-testid="global-fy-selector">
              <Calendar className="w-3 h-3 sm:w-4 sm:h-4 text-amber-400" />
              <div className="flex items-center gap-1">
                <span className="text-amber-400/70 text-[9px] sm:text-[10px] font-medium hidden sm:inline">FY</span>
                <Select value={filters.kms_year} onValueChange={(v) => handleFyChange(v, undefined)}>
                  <SelectTrigger className="bg-transparent border-0 text-amber-400 font-bold h-5 sm:h-6 text-xs sm:text-sm w-[80px] sm:w-[100px] p-0 focus:ring-0" data-testid="global-fy-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    {FY_YEARS.map(y => <SelectItem key={y} value={y} className="text-white">{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <span className="text-slate-600 hidden sm:inline">|</span>
              <Select value={filters.season || "all"} onValueChange={(v) => handleFyChange(undefined, v === "all" ? "" : v)}>
                <SelectTrigger className="bg-transparent border-0 text-slate-300 h-5 sm:h-6 text-[10px] sm:text-xs w-[55px] sm:w-[70px] p-0 focus:ring-0" data-testid="global-fy-season">
                  <SelectValue placeholder="Season" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  <SelectItem value="all" className="text-white">All</SelectItem>
                  <SelectItem value="Kharif" className="text-white">Kharif</SelectItem>
                  <SelectItem value="Rabi" className="text-white">Rabi</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <SessionIndicator onDataRefresh={() => { fetchEntries(); fetchTotals(); }} />

            <button
              onClick={() => setQuickSearchOpen(true)}
              className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg hover:bg-slate-700 hover:border-slate-500 transition-all group cursor-pointer"
              data-testid="quick-search-btn"
              title="Quick Search (Ctrl+K)"
            >
              <Search className="w-4 h-4 text-slate-400 group-hover:text-amber-400 transition-colors" />
              <span className="text-xs text-slate-400 hidden lg:inline">Search...</span>
              <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono text-slate-500 bg-slate-800 border border-slate-600 rounded ml-1">Ctrl+K</kbd>
            </button>

            <Button onClick={toggleTheme} variant="outline" size="sm"
              className="border-slate-600 text-slate-300 hover:bg-slate-700 hidden sm:flex" data-testid="theme-toggle-btn"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>

            <Button onClick={() => setShowShortcuts(true)} variant="outline" size="sm"
              className="border-slate-600 text-slate-300 hover:bg-slate-700 hidden lg:flex" data-testid="shortcuts-btn" title="Keyboard Shortcuts">
              <Keyboard className="w-4 h-4" />
            </Button>

            <SyncButton fetchEntries={fetchEntries} fetchTotals={fetchTotals} />

            <Button onClick={() => setShowWhatsNew(true)} variant="outline" size="sm"
              className="border-amber-600/50 text-amber-400 hover:bg-amber-900/30 hidden sm:flex" data-testid="whats-new-btn" title="What's New">
              <Info className="w-4 h-4 sm:mr-1" />
              <span className="hidden lg:inline">v{APP_VERSION}</span>
            </Button>

            {/* Govt Useful Links */}
            {govtLinks.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="border-emerald-600/50 text-emerald-400 hover:bg-emerald-900/30 hidden sm:flex" data-testid="govt-links-dropdown">
                    <ExternalLink className="w-4 h-4 sm:mr-1" />
                    <span className="hidden lg:inline">Govt Links</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-slate-800 border-slate-600 min-w-[220px]" align="end">
                  {govtLinks.map((link, idx) => (
                    <DropdownMenuItem key={idx} onClick={() => openGovtLink(link)}
                      className="text-slate-200 hover:bg-slate-700 cursor-pointer gap-2" data-testid={`govt-link-item-${idx}`}>
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                      <div className="flex-1 min-w-0">
                        <span className="block text-sm truncate">{link.name}</span>
                        {link.username && <span className="block text-[10px] text-slate-400 truncate">{link.username}</span>}
                      </div>
                      {link.username && <Copy className="w-3 h-3 text-slate-500" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Admin Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-slate-700 hover:bg-slate-600 rounded-full transition-colors cursor-pointer" data-testid="admin-dropdown-trigger">
                  <User className="w-4 h-4 text-amber-400" />
                  <span className="text-white text-xs sm:text-sm hidden sm:inline">{user.username}</span>
                  <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded ${user.role === 'admin' ? 'bg-red-600' : 'bg-blue-600'}`}>
                    {user.role.toUpperCase()}
                  </span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-slate-800 border-slate-600 min-w-[180px]" align="end">
                <DropdownMenuItem onClick={() => setIsPasswordDialogOpen(true)}
                  className="text-slate-200 hover:bg-slate-700 cursor-pointer gap-2" data-testid="change-password-btn">
                  <Key className="w-4 h-4 text-amber-400" /> Password Change
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-slate-600" />
                <DropdownMenuItem onClick={onLogout}
                  className="text-red-400 hover:bg-red-900/30 cursor-pointer gap-2" data-testid="logout-btn">
                  <LogOut className="w-4 h-4" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <ShortcutsDialog open={showShortcuts} onOpenChange={setShowShortcuts} />
        <BackupReminderDialog open={showBackupReminder} onOpenChange={setShowBackupReminder} onBackup={handleCreateBackup} loading={backupLoading} />
        <PasswordChangeDialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen} passwordData={passwordData} setPasswordData={setPasswordData} onSubmit={handlePasswordChange} />

        <QuickSearch
          open={quickSearchOpen} onOpenChange={setQuickSearchOpen}
          onNavigate={(tab, id, subtab, item) => {
            if (item?.type === 'entry' && id) { navigateToMillEntry(id); }
            else if (item) { setSearchDetailItem(item); }
            else { setActiveTabSafe(tab); if (subtab) setPaymentsInitSubTab(subtab); }
          }}
        />
        <SearchDetailDialog
          item={searchDetailItem} onClose={() => setSearchDetailItem(null)}
          onGoToTab={(item) => { setActiveTabSafe(item.tab); if (item.subtab) setPaymentsInitSubTab(item.subtab); }}
        />

        <TabNavigation activeTab={activeTab} setActiveTabSafe={setActiveTabSafe} user={user} />

        {/* Action Buttons - Only on Mill Entries subtab */}
        {activeTab === "entries" && entriesSubTab === "mill-entries" && (
          <EntriesActionBar
            fetchEntries={fetchEntries} fetchTotals={fetchTotals}
            showFilters={showFilters} setShowFilters={setShowFilters} hasActiveFilters={hasActiveFilters}
            handleExportExcel={handleExportExcel} handleExportPDF={handleExportPDF}
            handleEntriesWhatsApp={handleEntriesWhatsApp} handleEntriesGroupSend={handleEntriesGroupSend}
            handleEntriesTelegram={handleEntriesTelegram} entriesTgSending={entriesTgSending}
            wa={wa} tg={tg} user={user} filters={filters}
            isDialogOpen={isDialogOpen} setIsDialogOpen={setIsDialogOpen} editingId={editingId}
            formData={formData} setFormData={setFormData} calculatedFields={calculatedFields}
            leasedTruckNos={leasedTruckNos} truckSuggestions={truckSuggestions}
            agentSuggestions={agentSuggestions} mandiSuggestions={mandiSuggestions}
            openNewEntryDialog={openNewEntryDialog} handleSubmit={handleSubmit}
            handleInputChange={handleInputChange} debouncedRstLookup={debouncedRstLookup}
            handleAgentSelect={handleAgentSelect} findMandiCutting={findMandiCutting} rstFetched={rstFetched}
          />
        )}

        {activeTab === "entries" && entriesSubTab === "mill-entries" && showFilters && (
          <FilterPanel filters={filters} setFilters={setFilters} hasActiveFilters={hasActiveFilters} clearFilters={clearFilters} />
        )}
      </div>
    </header>
  );
};

const EntriesActionBar = ({
  fetchEntries, fetchTotals, showFilters, setShowFilters, hasActiveFilters,
  handleExportExcel, handleExportPDF,
  handleEntriesWhatsApp, handleEntriesGroupSend, handleEntriesTelegram, entriesTgSending,
  wa, tg, user, filters,
  isDialogOpen, setIsDialogOpen, editingId,
  formData, setFormData, calculatedFields,
  leasedTruckNos, truckSuggestions, agentSuggestions, mandiSuggestions,
  openNewEntryDialog, handleSubmit, handleInputChange, debouncedRstLookup,
  handleAgentSelect, findMandiCutting, rstFetched,
}) => (
  <div className="flex gap-1.5 sm:gap-2 flex-wrap mt-3">
    <Button onClick={() => { fetchEntries(); fetchTotals(); }} variant="outline" size="sm"
      className="border-slate-600 text-slate-300 hover:bg-slate-700" data-testid="refresh-btn">
      <RefreshCw className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Refresh</span>
    </Button>
    <Button onClick={() => setShowFilters(!showFilters)} variant="outline" size="sm"
      className={`border-slate-600 text-slate-300 hover:bg-slate-700 ${hasActiveFilters ? 'bg-amber-900/30 border-amber-600' : ''}`}
      data-testid="filter-btn">
      <Filter className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Filter</span>
      {hasActiveFilters && <span className="ml-1 bg-amber-500 text-xs px-1 rounded">ON</span>}
    </Button>
    <Button onClick={handleExportExcel} variant="outline" size="sm"
      className="border-green-600 text-green-400 hover:bg-green-900/30" data-testid="export-excel-btn">
      <FileSpreadsheet className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Excel</span>
    </Button>
    <Button onClick={handleExportPDF} variant="outline" size="sm"
      className="border-red-600 text-red-400 hover:bg-red-900/30" data-testid="export-pdf-btn">
      <FileText className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">PDF</span>
    </Button>
    {wa && <Button onClick={handleEntriesWhatsApp} variant="outline" size="sm"
      className="border-green-600 text-green-400 hover:bg-green-900/30" data-testid="entries-whatsapp-btn">
      <Send className="w-4 h-4 mr-1" /> WhatsApp
    </Button>}
    {wa && <Button onClick={handleEntriesGroupSend} variant="outline" size="sm"
      className="border-teal-600 text-teal-400 hover:bg-teal-900/30" data-testid="entries-group-btn">
      <Users className="w-4 h-4 mr-1" /> Group
    </Button>}
    {tg && <Button onClick={handleEntriesTelegram} disabled={entriesTgSending} variant="outline" size="sm"
      className="border-blue-600 text-blue-400 hover:bg-blue-900/30" data-testid="entries-telegram-btn">
      <Send className={`w-4 h-4 mr-1 ${entriesTgSending ? 'animate-pulse' : ''}`} /> Telegram
    </Button>}
    {user.role === 'admin' && (
      <ExcelImport filters={filters} user={user} onImportDone={fetchEntries} />
    )}
    <MillEntryForm
      isDialogOpen={isDialogOpen} setIsDialogOpen={setIsDialogOpen} editingId={editingId}
      formData={formData} setFormData={setFormData} calculatedFields={calculatedFields}
      leasedTruckNos={leasedTruckNos} truckSuggestions={truckSuggestions}
      agentSuggestions={agentSuggestions} mandiSuggestions={mandiSuggestions}
      openNewEntryDialog={openNewEntryDialog} handleSubmit={handleSubmit}
      handleInputChange={handleInputChange} debouncedRstLookup={debouncedRstLookup}
      handleAgentSelect={handleAgentSelect} findMandiCutting={findMandiCutting} rstFetched={rstFetched}
    />
  </div>
);

const SyncButton = () => {
  return (
    <Button
      onClick={async () => {
        try {
          const axiosLib = (await import('axios')).default;
          const { toast: toastLib } = await import('sonner');
          const res = await axiosLib.post(`${API}/sync/reload`);
          if (res.data.success) {
            toastLib.success(`Sync Done! Entries: ${res.data.entries || 0}, VW: ${res.data.vehicle_weights || 0}`);
            window.location.reload();
          }
        } catch (e) {
          const { toast: toastLib } = await import('sonner');
          toastLib.error('Sync failed: ' + (e.response?.data?.message || e.message));
        }
      }}
      variant="outline" size="sm"
      className="border-cyan-600/50 text-cyan-400 hover:bg-cyan-900/30 hidden sm:flex"
      data-testid="sync-reload-btn" title="Data sync karo"
    >
      <RefreshCw className="w-4 h-4 sm:mr-1" /><span className="hidden lg:inline">Sync</span>
    </Button>
  );
};

export default AppHeader;
