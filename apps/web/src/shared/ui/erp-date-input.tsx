"use client";

import { Calendar } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { dateEsToIso, formatDateEs, isoToDateEs, parseDateEs } from "@/shared/lib/date-es";

type ErpDateInputProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
  disabled?: boolean;
};

export function ErpDateInput({
  value,
  onChange,
  className = "",
  placeholder = "DD/MM/AAAA",
  "aria-label": ariaLabel,
  disabled = false,
}: ErpDateInputProps) {
  const id = useId();
  const nativeRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);
  const iso = dateEsToIso(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  const openPicker = () => {
    if (disabled) return;
    const el = nativeRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  };

  const commitText = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange("");
      setText("");
      return;
    }
    const parsed = parseDateEs(trimmed);
    if (parsed) {
      const formatted = formatDateEs(parsed);
      onChange(formatted);
      setText(formatted);
    } else {
      setText(value);
    }
  };

  return (
    <div className={`relative mt-0.5 flex min-w-[7.5rem] items-stretch gap-1 ${className}`}>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          const parsed = parseDateEs(next);
          if (parsed) onChange(formatDateEs(parsed));
        }}
        onBlur={() => commitText(text)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitText(text);
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        maxLength={10}
        autoComplete="off"
        className="erp-inline-input min-w-0 flex-1 py-1 pl-2 pr-1 tabular-nums"
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel} — calendario` : "Abrir calendario"}
        className="inline-flex shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white px-2 text-zinc-600 transition hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Calendar className="h-3.5 w-3.5" aria-hidden />
      </button>
      <input
        ref={nativeRef}
        id={id}
        type="date"
        value={iso}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute h-px w-px opacity-0"
        onChange={(e) => {
          const next = isoToDateEs(e.target.value);
          if (next) onChange(next);
        }}
      />
    </div>
  );
}
