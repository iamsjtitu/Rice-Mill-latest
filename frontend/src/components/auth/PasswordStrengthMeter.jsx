import { useMemo } from "react";
import { Check, X } from "lucide-react";

/**
 * Visual password strength indicator with rule checklist.
 * Levels: 0 (none) | 1 (weak/red) | 2 (fair/amber) | 3 (good/yellow) | 4 (strong/green)
 *
 * Rules: min 6 chars, lowercase, uppercase OR number, special char (any 1 = +1 point).
 */
function getStrength(pw) {
  if (!pw) return { score: 0, rules: [] };
  const rules = [
    { label: "Kam se kam 6 characters", ok: pw.length >= 6 },
    { label: "Lowercase letter (a-z)", ok: /[a-z]/.test(pw) },
    { label: "Uppercase letter ya Number (A-Z / 0-9)", ok: /[A-Z]/.test(pw) || /[0-9]/.test(pw) },
    { label: "Special character (!@#$ etc.)", ok: /[^a-zA-Z0-9]/.test(pw) },
  ];
  const score = rules.filter(r => r.ok).length;
  return { score, rules };
}

const LABELS = ["", "Weak", "Fair", "Good", "Strong"];
const COLORS = [
  "bg-slate-200",
  "bg-red-500",
  "bg-amber-500",
  "bg-yellow-400",
  "bg-emerald-500",
];
const TEXT_COLORS = [
  "text-slate-500",
  "text-red-600",
  "text-amber-600",
  "text-yellow-600",
  "text-emerald-600",
];

export function PasswordStrengthMeter({ password = "", showRules = true }) {
  const { score, rules } = useMemo(() => getStrength(password), [password]);
  const segments = 4;

  return (
    <div className="space-y-2 mt-1.5" data-testid="password-strength-meter">
      {/* Strength bar (4 segments) */}
      <div className="flex items-center gap-2">
        <div className="flex-1 grid grid-cols-4 gap-1">
          {Array.from({ length: segments }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-colors ${i < score ? COLORS[score] : "bg-slate-200"}`}
            />
          ))}
        </div>
        {password && (
          <span className={`text-xs font-bold ${TEXT_COLORS[score]} min-w-[55px] text-right`} data-testid="strength-label">
            {LABELS[score]}
          </span>
        )}
      </div>

      {/* Rule checklist */}
      {showRules && password && (
        <ul className="space-y-1">
          {rules.map(r => (
            <li key={r.label} className={`flex items-center gap-1.5 text-xs ${r.ok ? "text-emerald-700" : "text-slate-500"}`}>
              {r.ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
              <span>{r.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function isPasswordValid(pw) {
  return !!pw && pw.length >= 6;
}

export default PasswordStrengthMeter;
