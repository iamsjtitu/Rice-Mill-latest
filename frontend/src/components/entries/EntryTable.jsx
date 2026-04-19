import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Trash2, Edit, RefreshCw, Eye } from "lucide-react";
import RecordHistory from "@/components/RecordHistory";
import PaginationBar from "@/components/PaginationBar";
import ViewEntryDialog from "@/components/ViewEntryDialog";
import { fmtDate } from "@/utils/date";
import { useState, useEffect } from "react";

export function EntryTable({
  totals, entries, entriesPage, entriesTotalPages, entriesTotalCount, pageSize,
  selectedEntries, selectAll, loading, leasedTruckNos, hasActiveFilters, filters, todayStr,
  handleSelectAll, handleSelectEntry, handleBulkDelete, handleEdit, handleDelete,
  canEditEntry, fetchEntries, setEntriesPage, viewEntryData, onCloseViewEntry,
}) {
  const [viewEntry, setViewEntry] = useState(null);

  useEffect(() => {
    if (viewEntryData) setViewEntry(viewEntryData);
  }, [viewEntryData]);

  const handleCloseView = () => {
    setViewEntry(null);
    if (onCloseViewEntry) onCloseViewEntry();
  };

  return (
    <>
      {viewEntry && <ViewEntryDialog entry={viewEntry} onClose={handleCloseView} />}

      {/* Totals Summary */}
      <Card className="bg-slate-800/50 border-slate-700 mb-6">
        <CardHeader>
          <CardTitle className="text-amber-400 flex items-center justify-between">
            <span>Total Summary</span>
            {hasActiveFilters && <span className="text-sm text-slate-400">(Filtered)</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-green-900/30 p-3 rounded-lg border border-green-700">
              <p className="text-green-400 text-xs">Total QNTL</p>
              <p className="text-green-400 text-lg font-bold" data-testid="total-qntl">{totals.total_qntl?.toFixed(2) || 0}</p>
            </div>
            <div className="bg-slate-700/50 p-3 rounded-lg">
              <p className="text-slate-400 text-xs">Total BAG</p>
              <p className="text-white text-lg font-bold" data-testid="total-bag">{totals.total_bag?.toLocaleString() || 0}</p>
            </div>
            <div className="bg-blue-900/30 p-3 rounded-lg border border-blue-700">
              <p className="text-blue-400 text-xs">Total Mill W (QNTL)</p>
              <p className="text-blue-400 text-lg font-bold" data-testid="total-mill-w">{(totals.total_mill_w / 100)?.toFixed(2) || 0}</p>
            </div>
            <div className="bg-amber-900/30 p-3 rounded-lg border border-amber-700">
              <p className="text-amber-400 text-xs">Total Final W (QNTL)</p>
              <p className="text-amber-400 text-lg font-bold" data-testid="total-final-w">{(totals.total_final_w / 100)?.toFixed(2) || 0}</p>
            </div>
            <div className="bg-cyan-900/30 p-3 rounded-lg border border-cyan-700">
              <p className="text-cyan-400 text-xs">Total G.Issued</p>
              <p className="text-cyan-400 text-lg font-bold" data-testid="total-g-issued">{totals.total_g_issued?.toLocaleString() || 0}</p>
            </div>
            <div className="bg-slate-700/50 p-3 rounded-lg">
              <p className="text-slate-400 text-xs">Total Cash Paid</p>
              <p className="text-white text-lg font-bold" data-testid="total-cash">{totals.total_cash_paid?.toLocaleString() || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Entries Table */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-amber-400 flex items-center justify-between">
            <span>Mill Entries ({entriesTotalCount.toLocaleString()}) - KMS: {filters.kms_year || "All"}</span>
            <div className="flex items-center gap-3">
              {selectedEntries.length > 0 && (
                <Button onClick={handleBulkDelete} size="sm" className="bg-red-600 hover:bg-red-700 text-white" data-testid="bulk-delete-btn">
                  <Trash2 className="w-4 h-4 mr-1" /> Delete ({selectedEntries.length})
                </Button>
              )}
              {loading && <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto" id="entries-table">
            <Table className="text-[11px]">
              <TableHeader>
                <TableRow className="border-slate-700 hover:bg-slate-700/50">
                  <TableHead className="text-slate-300 w-8 px-0.5">
                    <input type="checkbox" checked={selectAll} onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-slate-500 bg-slate-700 text-amber-500 focus:ring-amber-500"
                      data-testid="select-all-checkbox" />
                  </TableHead>
                  <TableHead className="text-slate-300 whitespace-nowrap px-1">Date</TableHead>
                  <TableHead className="text-slate-300 whitespace-nowrap px-1">Season</TableHead>
                  <TableHead className="text-slate-300 whitespace-nowrap px-1">Truck</TableHead>
                  <TableHead className="text-slate-300 whitespace-nowrap px-1">RST</TableHead>
                  <TableHead className="text-slate-300 whitespace-nowrap px-1">TP</TableHead>
                  <TableHead className="text-slate-300 text-right whitespace-nowrap px-1">TP Wt</TableHead>
                  <TableHead className="text-slate-300 whitespace-nowrap px-1">Agent</TableHead>
                  <TableHead className="text-slate-300 whitespace-nowrap px-1">Mandi</TableHead>
                  <TableHead className="text-green-400 text-right whitespace-nowrap px-1">QNTL</TableHead>
                  <TableHead className="text-slate-300 text-right whitespace-nowrap px-1">BAG</TableHead>
                  <TableHead className="text-cyan-400 text-right whitespace-nowrap px-1">G.Dep</TableHead>
                  <TableHead className="text-slate-300 text-right whitespace-nowrap px-1">GBW</TableHead>
                  <TableHead className="text-pink-400 text-right whitespace-nowrap px-1">P.Pkt</TableHead>
                  <TableHead className="text-pink-300 text-right whitespace-nowrap px-1">P.Cut</TableHead>
                  <TableHead className="text-blue-400 text-right whitespace-nowrap px-1">Mill W</TableHead>
                  <TableHead className="text-orange-400 text-right whitespace-nowrap px-1">M%</TableHead>
                  <TableHead className="text-orange-300 text-right whitespace-nowrap px-1">M.Cut</TableHead>
                  <TableHead className="text-purple-400 text-right whitespace-nowrap px-1">C%</TableHead>
                  <TableHead className="text-slate-400 text-right whitespace-nowrap px-1">D/D/P</TableHead>
                  <TableHead className="text-amber-400 text-right whitespace-nowrap px-1">Final W</TableHead>
                  <TableHead className="text-cyan-400 text-right whitespace-nowrap px-1">G.Iss</TableHead>
                  <TableHead className="text-slate-300 text-right whitespace-nowrap px-1">Cash</TableHead>
                  <TableHead className="text-slate-300 text-right whitespace-nowrap px-1">Diesel</TableHead>
                  <TableHead className="text-slate-300 text-center whitespace-nowrap px-0.5">Act</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={25} className="text-center text-slate-400 py-8">
                      {filters.date_from === todayStr && filters.date_to === todayStr
                        ? "Aaj ki koi Mill Entry nahi hai"
                        : "Koi entry nahi mili. Filter change karein ya \"Nayi Entry\" button click karein."}
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((entry) => (
                    <TableRow key={entry.id}
                      className={`border-slate-700 hover:bg-slate-700/30 ${selectedEntries.includes(entry.id) ? 'bg-amber-900/20' : ''}`}
                      data-testid={`entry-row-${entry.id}`}>
                      <TableCell className="px-0.5">
                        <input type="checkbox" checked={selectedEntries.includes(entry.id)}
                          onChange={() => handleSelectEntry(entry.id)} disabled={!canEditEntry(entry)}
                          className="w-4 h-4 rounded border-slate-500 bg-slate-700 text-amber-500 focus:ring-amber-500 disabled:opacity-50"
                          data-testid={`select-${entry.id}`} />
                      </TableCell>
                      <TableCell className="text-white whitespace-nowrap px-1">{fmtDate(entry.date)}</TableCell>
                      <TableCell className="text-white whitespace-nowrap px-1">{entry.season}</TableCell>
                      <TableCell className="text-white font-mono whitespace-nowrap px-1">
                        {entry.truck_no}
                        {leasedTruckNos.has((entry.truck_no || '').toUpperCase()) && (
                          <span className="ml-1 inline-block text-[10px] px-1 py-0.5 rounded bg-violet-500/20 text-violet-400 border border-violet-500/30 font-sans" data-testid={`leased-badge-${entry.id}`}>Leased</span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-300 whitespace-nowrap px-1">{entry.rst_no || '-'}</TableCell>
                      <TableCell className="text-slate-300 whitespace-nowrap px-1">{entry.tp_no || '-'}</TableCell>
                      <TableCell className="text-right font-mono whitespace-nowrap px-1">
                        {Number(entry.tp_weight || 0) > 0 ? (
                          <span className="text-slate-300">
                            {Number(entry.tp_weight)}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-white whitespace-nowrap px-1">{entry.agent_name}</TableCell>
                      <TableCell className="text-white whitespace-nowrap px-1">{entry.mandi_name}</TableCell>
                      <TableCell className="text-green-400 text-right font-mono font-bold whitespace-nowrap px-1">{entry.qntl?.toFixed(2)}</TableCell>
                      <TableCell className="text-white text-right font-mono whitespace-nowrap px-1">{entry.bag}</TableCell>
                      <TableCell className="text-cyan-400 text-right font-mono whitespace-nowrap px-1">{entry.g_deposite || 0}</TableCell>
                      <TableCell className="text-slate-300 text-right font-mono whitespace-nowrap px-1">{(entry.gbw_cut / 100)?.toFixed(2)}</TableCell>
                      <TableCell className="text-pink-400 text-right font-mono whitespace-nowrap px-1">{entry.plastic_bag || 0}</TableCell>
                      <TableCell className="text-pink-300 text-right font-mono whitespace-nowrap px-1">{(entry.p_pkt_cut / 100)?.toFixed(2)}</TableCell>
                      <TableCell className="text-blue-400 text-right font-mono font-bold whitespace-nowrap px-1">{(entry.mill_w / 100)?.toFixed(2)}</TableCell>
                      <TableCell className="text-orange-400 text-right font-mono whitespace-nowrap px-1">{entry.moisture || 0}</TableCell>
                      <TableCell className="text-orange-300 text-right font-mono whitespace-nowrap px-1">{((entry.moisture_cut || 0) / 100)?.toFixed(2)}</TableCell>
                      <TableCell className="text-purple-400 text-right font-mono whitespace-nowrap px-1">{entry.cutting_percent}%</TableCell>
                      <TableCell className="text-slate-400 text-right font-mono whitespace-nowrap px-1">{entry.disc_dust_poll || 0}</TableCell>
                      <TableCell className="text-amber-400 text-right font-mono font-bold whitespace-nowrap px-1">{(entry.final_w / 100)?.toFixed(2)}</TableCell>
                      <TableCell className="text-cyan-400 text-right font-mono whitespace-nowrap px-1">{entry.g_issued?.toLocaleString() || 0}</TableCell>
                      <TableCell className="text-white text-right font-mono whitespace-nowrap px-1">{entry.cash_paid?.toLocaleString()}</TableCell>
                      <TableCell className="text-white text-right font-mono whitespace-nowrap px-1">{entry.diesel_paid?.toLocaleString() || 0}</TableCell>
                      <TableCell className="text-center px-0.5">
                        <div className="flex gap-0.5 justify-center">
                          <Button size="sm" variant="ghost" onClick={() => setViewEntry(entry)}
                            className="h-6 w-6 p-0 text-amber-400 hover:text-amber-300 hover:bg-amber-900/30"
                            data-testid={`view-btn-${entry.id}`} title="View Details">
                            <Eye className="w-3 h-3" />
                          </Button>
                          <RecordHistory recordId={entry.id} label={entry.truck_no} />
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(entry)}
                            className={`h-6 w-6 p-0 ${canEditEntry(entry) ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-900/30' : 'text-slate-600 cursor-not-allowed'}`}
                            data-testid={`edit-btn-${entry.id}`} disabled={!canEditEntry(entry)}>
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(entry)}
                            className={`h-6 w-6 p-0 ${canEditEntry(entry) ? 'text-red-400 hover:text-red-300 hover:bg-red-900/30' : 'text-slate-600 cursor-not-allowed'}`}
                            data-testid={`delete-btn-${entry.id}`} disabled={!canEditEntry(entry)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <PaginationBar page={entriesPage} totalPages={entriesTotalPages} total={entriesTotalCount} pageSize={pageSize}
            onPageChange={(p) => { setEntriesPage(p); fetchEntries(p); }} />
        </CardContent>
      </Card>
    </>
  );
}
