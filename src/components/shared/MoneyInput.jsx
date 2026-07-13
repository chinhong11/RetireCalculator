import { useRef } from "react";

/**
 * Whole-dollar amount input with live thousands separators — typing 480000
 * shows "480,000" as you type, so users stop miscounting zeros.
 *
 * - Emits a plain non-negative integer via onChange (0 when cleared).
 * - type="text" + inputMode="numeric" keeps the mobile numeric keypad.
 * - The caret is re-anchored after each reformat by counting digits to its
 *   left, so editing mid-value doesn't make the cursor jump to the end.
 *
 * @param {{
 *   value: number,
 *   onChange: (n: number) => void,
 *   max?: number,
 *   placeholder?: string,
 *   className?: string,
 *   style?: object,
 *   autoFocus?: boolean,
 *   onKeyDown?: (e: KeyboardEvent) => void,
 * }} props
 */
export function MoneyInput({ value, onChange, max = 1e12, placeholder, className, style, autoFocus, onKeyDown }) {
  const ref = useRef(null);

  const display = value ? Math.trunc(value).toLocaleString("en-US") : "";

  const handleChange = (e) => {
    const el = e.target;
    const digitsBeforeCaret = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/\D/g, "").length;

    const digits = el.value.replace(/\D/g, "");
    const num = Math.min(digits ? parseInt(digits, 10) : 0, max);
    onChange(num);

    // Restore the caret after React re-renders the formatted value: place it
    // after the same number of digits it had to its left before the edit.
    const restore = () => {
      const input = ref.current;
      if (!input) return;
      const formatted = num ? num.toLocaleString("en-US") : "";
      let pos = 0, seen = 0;
      while (pos < formatted.length && seen < digitsBeforeCaret) {
        if (/\d/.test(formatted[pos])) seen++;
        pos++;
      }
      try { input.setSelectionRange(pos, pos); } catch {}
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(restore);
    else setTimeout(restore, 0);
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={display}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      style={style}
      autoFocus={autoFocus}
      onKeyDown={onKeyDown}
    />
  );
}
