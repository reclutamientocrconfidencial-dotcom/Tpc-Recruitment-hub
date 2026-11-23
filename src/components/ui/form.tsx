import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const CONTROL =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-ink-950 outline-none transition " +
  "focus:border-brand-600 focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-brand-600 disabled:bg-neutral-100 disabled:text-neutral-500";

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Contenedor accesible: etiqueta, control, ayuda y error asociados por id. */
export function Field({ id, label, error, hint, required, className, children }: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-950">
        {label}
        {required ? <span className="ml-0.5 text-brand-600" aria-hidden>*</span> : null}
      </label>
      {children}
      {hint && !error ? <p id={`${id}-hint`} className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
      {error ? <p id={`${id}-error`} className="mt-1 text-xs text-brand-700">{error}</p> : null}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: string) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

type ControlExtra = { error?: string; hint?: string };

export function TextInput({ id, error, hint, className, ...props }: InputHTMLAttributes<HTMLInputElement> & ControlExtra & { id: string }) {
  return (
    <input
      id={id}
      name={props.name ?? id}
      aria-invalid={Boolean(error)}
      aria-describedby={describedBy(id, error, hint)}
      className={cn(CONTROL, className)}
      {...props}
    />
  );
}

export function SelectInput({
  id,
  error,
  hint,
  className,
  options,
  placeholder,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> &
  ControlExtra & { id: string; options: Array<{ value: string; label: string }>; placeholder?: string }) {
  return (
    <select
      id={id}
      name={props.name ?? id}
      aria-invalid={Boolean(error)}
      aria-describedby={describedBy(id, error, hint)}
      className={cn(CONTROL, className)}
      {...props}
    >
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextArea({ id, error, hint, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & ControlExtra & { id: string }) {
  return (
    <textarea
      id={id}
      name={props.name ?? id}
      aria-invalid={Boolean(error)}
      aria-describedby={describedBy(id, error, hint)}
      className={cn(CONTROL, "min-h-24", className)}
      {...props}
    />
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 border-b border-neutral-100 px-5 py-6 last:border-b-0 md:grid-cols-3">
      <div>
        <h2 className="text-sm font-semibold text-ink-950">{title}</h2>
        {description ? <p className="mt-1 text-xs text-neutral-500">{description}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 md:col-span-2">{children}</div>
    </section>
  );
}
