import { cn } from "@/lib/cn";

export function Logo({ inverted = false, className }: { inverted?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-black tracking-tighter text-white shadow">
        TPC
      </div>
      <div className="leading-tight">
        <p className={cn("text-sm font-bold", inverted ? "text-white" : "text-ink-950")}>Recruitment Hub</p>
        <p className={cn("text-[11px]", inverted ? "text-neutral-400" : "text-neutral-500")}>The People Outsourcing Co.</p>
      </div>
    </div>
  );
}
