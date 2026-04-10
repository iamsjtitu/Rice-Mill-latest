import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, RefreshCw, Trash2 } from "lucide-react";
import { API } from "./settingsConstants";

function ErrorLogTab() {
  const [errorLog, setErrorLog] = useState("");

  const fetchErrorLog = async () => {
    try {
      const res = await axios.get(`${API}/error-log`);
      setErrorLog(res.data.content || "");
    } catch { setErrorLog(""); }
  };

  useEffect(() => { fetchErrorLog(); }, []);

  return (
    <div className="space-y-4">
      <Card className="bg-slate-800 border-slate-700" data-testid="error-log-section">
        <CardHeader>
          <CardTitle className="text-red-400 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Error Log / त्रुटि लॉग
          </CardTitle>
          <p className="text-slate-400 text-sm">
            App ke errors yahan dikhte hain. Ye Desktop version mein kaam karta hai.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button onClick={fetchErrorLog} variant="outline" size="sm"
              className="border-red-600 text-red-400 hover:bg-red-900/30" data-testid="refresh-error-log-btn">
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh Log
            </Button>
            <Button
              onClick={async () => {
                try {
                  await fetch(`${API}/error-log`, { method: 'DELETE' });
                  setErrorLog("Log clear ho gaya. Koi error nahi hai.");
                } catch (e) { console.error(e); }
              }}
              variant="outline" size="sm"
              className="border-amber-600 text-amber-400 hover:bg-amber-900/30" data-testid="clear-error-log-btn">
              <Trash2 className="w-4 h-4 mr-1" /> Clear Log
            </Button>
          </div>
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 max-h-64 overflow-y-auto">
            <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono" data-testid="error-log-content">
              {errorLog || "Koi error log nahi hai."}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ErrorLogTab;
