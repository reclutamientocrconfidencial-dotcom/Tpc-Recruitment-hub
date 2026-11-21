import { cn } from "@/lib/cn";
import type { LabelDef, Tone } from "@/modules/labels";

const TONES: Record<Tone, string> = {
  neutral: "bg-neutral-100 text-neutral-800 ring-neutral-200",
  red: "bg-brand-50 text-brand-700 ring-brand-200",
  dark: "bg-ink-950 text-white ring-ink-950",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  muted: "bg-white text-neutral-500 ring-neutral-200",
};

export function Badge({ def, className }: { def: LabelDef; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONES[def.tone],
        className,
      )}
    >
      {def.label}
    </span>
  );
}
