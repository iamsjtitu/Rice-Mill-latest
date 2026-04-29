import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Calculator, HardDrive, ShieldCheck, Send, Package, Scale,
  Camera, AlertCircle, Key, Users, History, Droplets, ExternalLink, ShieldAlert, Lock,
} from "lucide-react";

import BrandingTab from "./settings/BrandingTab";
import GSTTab from "./settings/GSTTab";
import StockTab from "./settings/StockTab";
import MessagingTab from "./settings/MessagingTab";
import WeighbridgeConfigCard from "./settings/WeighbridgeTab";
import DataTab from "./settings/DataTab";
import ErrorLogTab from "./settings/ErrorLogTab";
import CameraSetupTab from "./settings/CameraSetupTab";
import UsersTab from "./settings/UsersTab";
import AuditLogTab from "./settings/AuditLogTab";
import WatermarkTab from "./settings/WatermarkTab";
import GovtLinksTab from "./settings/GovtLinksTab";
import LicenseTab from "./settings/LicenseTab";
import PermissionsTab from "./settings/PermissionsTab";

const SUB_TABS = [
  { id: "users", label: "Users", icon: Users },
  { id: "permissions", label: "Permissions", icon: Lock },
  { id: "audit", label: "Audit Log", icon: History },
  { id: "branding", label: "Branding", icon: Key },
  { id: "watermark", label: "Watermark", icon: Droplets },
  { id: "gst", label: "GST", icon: Calculator },
  { id: "stock", label: "Stock", icon: Package },
  { id: "messaging", label: "Messaging", icon: Send },
  { id: "govt-links", label: "Govt Links", icon: ExternalLink },
  { id: "camera", label: "Camera", icon: Camera },
  { id: "weighbridge", label: "Weighbridge", icon: Scale },
  { id: "data", label: "Data", icon: HardDrive },
  { id: "license", label: "License", icon: ShieldAlert },
  { id: "errorlog", label: "Error Log", icon: AlertCircle },
];

export default function Settings({ user, setUser, kmsYear, onBrandingUpdate }) {
  const [activeSubTab, setActiveSubTab] = useState("users");

  return (
    <div className="max-w-4xl mx-auto" data-testid="settings-page">
      <div className="mb-6">
        <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
          <TabsList className="w-full bg-slate-800/80 border border-slate-700 h-auto p-1 flex flex-wrap gap-1" data-testid="settings-sub-tabs">
            {SUB_TABS.map(tab => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium data-[state=active]:bg-amber-600 data-[state=active]:text-white text-slate-400 hover:text-slate-200 transition-colors rounded-md whitespace-nowrap"
                data-testid={`settings-tab-${tab.id}`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="users"><UsersTab user={user} setUser={setUser} /></TabsContent>
          <TabsContent value="permissions"><PermissionsTab /></TabsContent>
          <TabsContent value="audit"><AuditLogTab user={user} /></TabsContent>
          <TabsContent value="branding"><BrandingTab user={user} onBrandingUpdate={onBrandingUpdate} /></TabsContent>
          <TabsContent value="watermark"><WatermarkTab /></TabsContent>
          <TabsContent value="gst"><GSTTab /></TabsContent>
          <TabsContent value="stock"><StockTab kmsYear={kmsYear} user={user} /></TabsContent>
          <TabsContent value="messaging"><MessagingTab /></TabsContent>
          <TabsContent value="govt-links"><GovtLinksTab /></TabsContent>
          <TabsContent value="camera"><CameraSetupTab /></TabsContent>
          <TabsContent value="weighbridge"><WeighbridgeConfigCard /></TabsContent>
          <TabsContent value="data"><DataTab user={user} /></TabsContent>
          <TabsContent value="license"><LicenseTab /></TabsContent>
          <TabsContent value="errorlog"><ErrorLogTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
