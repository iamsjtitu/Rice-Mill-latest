import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { User, Lock, Sun, Moon } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * LoginPage - Authentication component with dynamic branding
 */
const LoginPage = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [branding, setBranding] = useState({ company_name: "Mill Entry System", tagline: "" });
  const [theme, setTheme] = useState(() => localStorage.getItem('mill_theme') || 'dark');

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('mill_theme', newTheme);
  };

  // Fetch branding on mount
  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const response = await axios.get(`${API}/branding`);
        setBranding(response.data);
      } catch (error) {
        console.error("Branding fetch error:", error);
      }
    };
    fetchBranding();
  }, []);

  useEffect(() => {
    const isElectron = typeof window !== 'undefined' && window.ELECTRON_API_URL;
    if (isElectron) return;
    const removeBadge = () => {
      document.querySelectorAll('a[href*="emergent"], iframe[src*="emergent"]').forEach(el => el.remove());
    };
    removeBadge();
    const timeout = setTimeout(removeBadge, 3000);
    return () => clearTimeout(timeout);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(`${API}/auth/login`, { username, password });
      if (response.data.success) {
        onLogin(response.data.username, response.data.role);
        toast.success(`Welcome ${response.data.role === 'admin' ? 'Admin' : 'Staff'}!`);
      }
    } catch (error) {
      toast.error("Invalid username or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4" data-theme={theme}>
      <Button
        onClick={toggleTheme}
        variant="outline"
        size="sm"
        className="fixed top-4 right-4 border-slate-600 text-slate-300 hover:bg-slate-700 z-20"
        data-testid="login-theme-toggle"
      >
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </Button>
      <Card className="w-full max-w-md bg-slate-800 border-slate-700">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-amber-400">{branding.company_name}</CardTitle>
          <p className="text-slate-400">{branding.tagline}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label className="text-slate-300">Username</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="pl-10 bg-slate-700 border-slate-600 text-white"
                  data-testid="login-username"
                />
              </div>
            </div>
            <div>
              <Label className="text-slate-300">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="pl-10 bg-slate-700 border-slate-600 text-white"
                  data-testid="login-password"
                />
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold"
              disabled={loading}
              data-testid="login-btn"
            >
              {loading ? "Logging in..." : "Login"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;
