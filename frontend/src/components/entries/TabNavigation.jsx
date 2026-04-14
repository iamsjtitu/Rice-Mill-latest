import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  FileSpreadsheet, FileText, BarChart3, TrendingUp, Truck,
  Users, IndianRupee, Key, Wheat, Wallet, Package, UserCheck,
  Menu, X, ChevronLeft, ChevronRight
} from "lucide-react";

export function TabNavigation({ activeTab, setActiveTabSafe, user }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const perms = user.permissions || {};
  const isAdmin = user.role === 'admin';

  const tabs = [
    { id: "entries", label: "Entries", icon: FileSpreadsheet },
    { id: "dashboard", label: "Dashboard & Targets", icon: BarChart3 },
    { id: "milling", label: "Milling (CMR)", icon: Wheat },
    { id: "vouchers", label: "Register", icon: FileText },
    { id: "cashbook", label: "Cash Book & Ledgers", icon: Wallet, perm: "can_see_cashbook" },
    { id: "payments", label: "Payments", icon: IndianRupee, perm: "can_see_payments" },
    { id: "reports", label: "Reports", icon: BarChart3, perm: "can_see_reports" },
    { id: "mill-parts", label: "Mill Parts", icon: Package },
    { id: "staff", label: "Staff", icon: UserCheck },
    { id: "hemali", label: "Hemali", icon: Users },
    { id: "fy-summary", label: "FY Summary", icon: TrendingUp },
  ].filter(t => !t.perm || isAdmin || perms[t.perm]);

  if (isAdmin || perms.can_edit_settings) {
    tabs.push({ id: "settings", label: "Settings", icon: Key });
  }

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 5);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 5);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) { el.addEventListener('scroll', checkScroll); window.addEventListener('resize', checkScroll); }
    return () => { if (el) el.removeEventListener('scroll', checkScroll); window.removeEventListener('resize', checkScroll); };
  }, [checkScroll]);

  // Scroll active tab into view
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const activeBtn = el.querySelector(`[data-testid="tab-${activeTab}"]`);
    if (activeBtn) activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    setTimeout(checkScroll, 300);
  }, [activeTab, checkScroll]);

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  // Keyboard Left/Right to navigate between tabs
  useEffect(() => {
    const handleKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const idx = tabs.findIndex(t => t.id === activeTab);
        const newIdx = idx <= 0 ? tabs.length - 1 : idx - 1;
        setActiveTabSafe(tabs[newIdx].id);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const idx = tabs.findIndex(t => t.id === activeTab);
        const newIdx = idx >= tabs.length - 1 ? 0 : idx + 1;
        setActiveTabSafe(tabs[newIdx].id);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tabs.length]);

  const activeLabel = tabs.find(t => t.id === activeTab)?.label || "Menu";
  const ActiveIcon = tabs.find(t => t.id === activeTab)?.icon || Menu;

  return (
    <>
      {/* Desktop - horizontal scrollable tabs with arrow buttons */}
      <div className="hidden md:flex items-center gap-1 mt-4 border-b border-slate-700 pb-2">
        {canScrollLeft && (
          <button onClick={() => scroll('left')}
            className="flex-shrink-0 p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            data-testid="tab-scroll-left">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <div ref={scrollRef} className="flex gap-2 overflow-x-auto scrollbar-hide flex-1" style={{ scrollbarWidth: 'none' }}>
          {tabs.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              onClick={() => setActiveTabSafe(id)}
              variant={activeTab === id ? "default" : "ghost"}
              size="sm"
              className={`whitespace-nowrap ${activeTab === id
                ? id === "settings" ? "bg-purple-500 hover:bg-purple-600 text-white" : "bg-amber-500 hover:bg-amber-600 text-slate-900"
                : "text-slate-300 hover:bg-slate-700"}`}
              data-testid={`tab-${id}`}
            >
              <Icon className="w-4 h-4 mr-1" />
              {label}
            </Button>
          ))}
        </div>
        {canScrollRight && (
          <button onClick={() => scroll('right')}
            className="flex-shrink-0 p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            data-testid="tab-scroll-right">
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Mobile - hamburger menu */}
      <div className="md:hidden mt-3">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="flex items-center justify-between w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg"
          data-testid="mobile-menu-toggle"
        >
          <div className="flex items-center gap-2">
            <ActiveIcon className="w-4 h-4 text-amber-400" />
            <span className="text-amber-400 font-semibold text-sm">{activeLabel}</span>
          </div>
          {mobileMenuOpen ? <X className="w-5 h-5 text-slate-400" /> : <Menu className="w-5 h-5 text-slate-400" />}
        </button>

        {mobileMenuOpen && (
          <div className="mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden animate-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-3 gap-0.5 p-2">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { setActiveTabSafe(id); setMobileMenuOpen(false); }}
                  className={`flex flex-col items-center gap-1 py-3 px-1 rounded-lg transition-colors ${
                    activeTab === id
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                      : "text-slate-300 hover:bg-slate-700"
                  }`}
                  data-testid={`mobile-tab-${id}`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium leading-tight text-center">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
