import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * AutoSuggest - Dropdown Component with Keyboard Support
 * Features: Arrow keys navigation, Enter to select, Escape to close
 */
const AutoSuggest = ({ value, onChange, suggestions, placeholder, onSelect, onBlur, label, testId, labelClassName, inputClassName, disabled }) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (value && suggestions.length > 0) {
      const q = value.toLowerCase().trim();
      // Smart matching: prioritize (1) prefix match on full string, (2) prefix match on any word token,
      // (3) substring match. Handles "08" → "OD 08 R 7074" and "7074" → same, ranked naturally.
      const scored = suggestions.map(s => {
        const lower = String(s).toLowerCase();
        if (lower.startsWith(q)) return { s, rank: 0 };
        // word-token prefix (split on space, dash, slash, underscore)
        const tokens = lower.split(/[\s\-_/]+/).filter(Boolean);
        if (tokens.some(t => t.startsWith(q))) return { s, rank: 1 };
        if (lower.includes(q)) return { s, rank: 2 };
        return null;
      }).filter(Boolean);
      scored.sort((a, b) => a.rank - b.rank);
      setFilteredSuggestions(scored.map(x => x.s));
    } else {
      setFilteredSuggestions(suggestions);
    }
    setActiveIndex(-1);
  }, [value, suggestions]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowSuggestions(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const activeElement = listRef.current.children[activeIndex];
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex]);

  const handleKeyDown = (e) => {
    if (!showSuggestions || filteredSuggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => 
          prev < filteredSuggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => 
          prev > 0 ? prev - 1 : filteredSuggestions.length - 1
        );
        break;
      case 'Enter':
        if (activeIndex >= 0 && activeIndex < filteredSuggestions.length) {
          e.preventDefault();
          onSelect(filteredSuggestions[activeIndex]);
          setShowSuggestions(false);
          setActiveIndex(-1);
        } else {
          // No suggestion selected - close dropdown & let global Enter handler navigate
          setShowSuggestions(false);
          setActiveIndex(-1);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setActiveIndex(-1);
        break;
      case 'Tab':
        if (activeIndex >= 0 && activeIndex < filteredSuggestions.length) {
          onSelect(filteredSuggestions[activeIndex]);
        }
        setShowSuggestions(false);
        setActiveIndex(-1);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Label className={labelClassName || "text-slate-300"}>{label}</Label>
      <Input
        value={value}
        onChange={(e) => {
          if (disabled) return;
          onChange(e);
          setShowSuggestions(true);
        }}
        onFocus={() => { if (!disabled) setShowSuggestions(true); }}
        onBlur={(e) => {
          if (onBlur) onBlur(e);
        }}
        onKeyDown={disabled ? undefined : handleKeyDown}
        placeholder={placeholder}
        className={disabled ? "bg-slate-800 border-slate-600 text-slate-400 cursor-not-allowed" : (inputClassName || "bg-slate-700 border-slate-600 text-white")}
        data-testid={testId}
        readOnly={disabled}
        tabIndex={disabled ? -1 : undefined}
      />
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div 
          ref={listRef}
          className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-md shadow-lg max-h-48 overflow-y-auto"
        >
          {filteredSuggestions.map((suggestion, index) => (
            <div
              key={`${suggestion}-${index}`}
              className={`px-3 py-2 cursor-pointer text-slate-100 text-sm transition-colors ${
                index === activeIndex 
                  ? 'bg-amber-100 text-amber-800' 
                  : 'hover:bg-slate-700'
              }`}
              onClick={() => {
                onSelect(suggestion);
                setShowSuggestions(false);
                setActiveIndex(-1);
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AutoSuggest;
