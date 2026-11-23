"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SearchOption {
  value: string;
  label: string;
  hint?: string | null;
  inactive?: boolean;
}

/**
 * Selector con buscador (combobox accesible, WAI-ARIA 1.2).
 * - Filtra sin distinguir mayúsculas ni acentos.
 * - Opcionalmente permite usar un texto nuevo («Crear …») cuando `allowCreate`.
 * - Envía el valor en un input oculto `name` y, si se crea uno nuevo, en `${name}_new`.
 */
export function SearchSelect({
  id,
  name,
  label,
  options,
  defaultValue,
  placeholder = "Escriba para buscar…",
  allowCreate = false,
  createLabel = "Crear",
  onChange,
  disabled,
  error,
  maxResults = 50,
}: {
  id: string;
  name: string;
  label: string;
  options: SearchOption[];
  defaultValue?: string | null;
  placeholder?: string;
  allowCreate?: boolean;
  createLabel?: string;
  onChange?: (value: string, option: SearchOption | null, newText: string) => void;
  disabled?: boolean;
  error?: string;
  maxResults?: number;
}) {
  const listId = useId();
  const initial = options.find((o) => o.value === defaultValue) ?? null;
  const [query, setQuery] = useState(initial?.label ?? "");
  const [selected, setSelected] = useState<SearchOption | null>(initial);
  const [newText, setNewText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const filtered = useMemo(() => {
    const q = norm(query);
    const list = options.filter((o) => !o.inactive && (!q || norm(o.label).includes(q) || norm(o.hint ?? "").includes(q)));
    return list.slice(0, maxResults);
  }, [options, query, maxResults]);
  const exact = options.some((o) => norm(o.label) === norm(query));
  const showCreate = allowCreate && query.trim().length >= 2 && !exact;
  const total = filtered.length + (showCreate ? 1 : 0);

  function choose(option: SearchOption | null, text = "") {
    setSelected(option);
    setNewText(option ? "" : text);
    setQuery(option ? option.label : text);
    setOpen(false);
    onChange?.(option?.value ?? "", option, option ? "" : text);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, Math.max(total - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (active < filtered.length) choose(filtered[active] ?? null);
      else if (showCreate) choose(null, query.trim());
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selected?.value ?? ""} />
      {allowCreate ? <input type="hidden" name={`${name}_new`} value={newText} /> : null}
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={Boolean(error)}
          aria-activedescendant={open && total > 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
            setNewText("");
            setOpen(true);
            setActive(0);
            onChange?.("", null, "");
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          className={cn(
            "w-full rounded-lg border border-neutral-300 bg-white py-2 pl-3 pr-8 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100 disabled:bg-neutral-100",
            error && "border-brand-600",
          )}
        />
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
      </div>
      {open && !disabled ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-neutral-200 bg-white py-1 text-sm shadow-lg"
        >
          {filtered.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={selected?.value === o.value}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-center justify-between gap-2 px-3 py-2", i === active && "bg-brand-50")}
            >
              <span>
                <span className="text-ink-950">{o.label}</span>
                {o.hint ? <span className="ml-2 text-xs text-neutral-500">{o.hint}</span> : null}
              </span>
              {selected?.value === o.value ? <Check className="h-4 w-4 text-brand-600" aria-hidden /> : null}
            </li>
          ))}
          {showCreate ? (
            <li
              id={`${listId}-${filtered.length}`}
              role="option"
              aria-selected={false}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(null, query.trim());
              }}
              onMouseEnter={() => setActive(filtered.length)}
              className={cn("flex cursor-pointer items-center gap-2 px-3 py-2 font-medium text-brand-700", active === filtered.length && "bg-brand-50")}
            >
              <Plus className="h-4 w-4" aria-hidden /> {createLabel} «{query.trim()}»
            </li>
          ) : null}
          {total === 0 ? <li className="px-3 py-2 text-neutral-500">Sin coincidencias.</li> : null}
        </ul>
      ) : null}
      {newText ? <p className="mt-1 text-xs text-brand-700">Se agregará «{newText}» al catálogo al guardar.</p> : null}
    </div>
  );
}
