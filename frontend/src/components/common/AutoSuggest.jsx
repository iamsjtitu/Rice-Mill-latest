import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * AutoSuggest - Dropdown Component with Keyboard Support
 * Features: Arrow keys navigation, Enter to select, Escape to close
 */
const AutoSuggest = ({ value, onChange, suggestions, placeholder, onSelect, onBlur, label, testId, labelClassName, inputClassName }) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (value && suggestions.length > 0) {
      const filtered = suggestions.filter(s => 
        s.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredSuggestions(filtered);
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
  }, []);

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
          onChange(e);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={(e) => {
          if (onBlur) onBlur(e);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={inputClassName || "bg-slate-700 border-slate-600 text-white"}
        data-testid={testId}
      />
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div 
          ref={listRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto"
        >
          {filteredSuggestions.map((suggestion, index) => (
            <div
              key={index}
              className={`px-3 py-2 cursor-pointer text-gray-900 text-sm transition-colors ${
                index === activeIndex 
                  ? 'bg-amber-100 text-amber-800' 
                  : 'hover:bg-gray-100'
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
