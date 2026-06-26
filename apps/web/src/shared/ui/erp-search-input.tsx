import { Search } from "lucide-react";

type ErpSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label": string;
  wrapperClassName?: string;
  inputClassName?: string;
};

/** Search field with left icon — padding is defined in `.erp-search-input` (not `erp-inline-input`). */
export function ErpSearchInput({
  value,
  onChange,
  placeholder = "Buscar…",
  "aria-label": ariaLabel,
  wrapperClassName = "",
  inputClassName = "",
}: ErpSearchInputProps) {
  return (
    <div className={`relative ${wrapperClassName}`.trim()}>
      <Search className="erp-search-icon" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={`erp-search-input w-full ${inputClassName}`.trim()}
      />
    </div>
  );
}
