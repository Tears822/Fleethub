"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

type PasswordInputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  disabled,
  required,
  className,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        className={`erp-input pr-10 ${className ?? ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        required={required}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 transition hover:text-zinc-800"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        tabIndex={-1}
        disabled={disabled}
      >
        {visible ? (
          <EyeOff className="h-4 w-4" strokeWidth={2} aria-hidden />
        ) : (
          <Eye className="h-4 w-4" strokeWidth={2} aria-hidden />
        )}
      </button>
    </div>
  );
}
