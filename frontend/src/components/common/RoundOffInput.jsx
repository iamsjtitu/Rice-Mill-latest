import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Reusable Round Off input for all payment dialogs.
 * Props:
 *   value: string - current round off value
 *   onChange: (val: string) => void
 *   amount: number - original payment amount (to show adjusted total)
 *   darkMode: boolean - true for dark-themed dialogs (default), false for light
 */
const RoundOffInput = ({ value, onChange, amount = 0, darkMode = true }) => {
  const roundOff = parseFloat(value) || 0;
  const adjustedTotal = (amount || 0) + roundOff;

  return (
    <div className="space-y-1" data-testid="round-off-section">
      <Label className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
        Round Off / राउंड ऑफ
      </Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0 (+10 ya -10)"
          className={`${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'border-slate-300'} h-8 text-sm flex-1`}
          data-testid="round-off-input"
        />
        {roundOff !== 0 && amount > 0 && (
          <span className={`text-xs whitespace-nowrap ${roundOff > 0 ? (darkMode ? 'text-red-400' : 'text-red-600') : (darkMode ? 'text-green-400' : 'text-green-600')}`} data-testid="round-off-adjusted">
            = Rs.{adjustedTotal.toLocaleString('en-IN')}
          </span>
        )}
      </div>
      {roundOff !== 0 && (
        <p className={`text-[10px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
          {roundOff > 0 ? `+${roundOff} extra nikasi (Cash Book mein alag entry)` : `${roundOff} kam (Cash Book mein alag entry)`}
        </p>
      )}
    </div>
  );
};

export default RoundOffInput;
