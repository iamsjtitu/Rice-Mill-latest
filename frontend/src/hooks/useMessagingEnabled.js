import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import logger from "../utils/logger";

const _isElectron = typeof window !== "undefined" && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? "" : (process.env.REACT_APP_BACKEND_URL || "");
const API = `${BACKEND_URL}/api`;

export function useMessagingEnabled() {
  const [flags, setFlags] = useState({ wa: false, tg: false });

  const fetchFlags = useCallback(async () => {
    try {
      const [waRes, tgRes] = await Promise.all([
        axios.get(`${API}/whatsapp/settings`).catch(() => ({ data: {} })),
        axios.get(`${API}/telegram/config`).catch(() => ({ data: {} }))
      ]);
      setFlags({
        wa: !!(waRes.data?.enabled && waRes.data?.api_key),
        tg: !!(tgRes.data?.enabled && tgRes.data?.bot_token)
      });
    } catch (e) { logger.error('Messaging flags fetch error:', e); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchFlags();
    const handler = () => fetchFlags();
    window.addEventListener("messaging-config-changed", handler);
    return () => window.removeEventListener("messaging-config-changed", handler);
  }, [fetchFlags]);

  return flags;
}
