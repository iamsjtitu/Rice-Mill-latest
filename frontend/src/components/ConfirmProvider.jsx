import { createContext, useContext, useState, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState({ open: false, title: "", description: "", onConfirm: null, onCancel: null });

  const showConfirm = useCallback((title, description) => {
    return new Promise((resolve) => {
      setState({
        open: true, title, description,
        onConfirm: () => { setState(prev => ({ ...prev, open: false })); resolve(true); },
        onCancel: () => { setState(prev => ({ ...prev, open: false })); resolve(false); },
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ConfirmContext.Provider value={showConfirm}>
      {children}
      <AlertDialog open={state.open} onOpenChange={(open) => { if (!open && state.onCancel) state.onCancel(); }}>
        <AlertDialogContent className="bg-slate-800 border-slate-700" data-testid="confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{state.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">{state.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600" data-testid="confirm-cancel-btn">Nahi</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={state.onConfirm} data-testid="confirm-ok-btn">Haan, Karein</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
