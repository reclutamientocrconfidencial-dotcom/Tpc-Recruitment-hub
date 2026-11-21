import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/cn";

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "error";
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "error" ? AlertTriangle : Info;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-lg border px-4 py-3 text-sm",
        tone === "error" ? "border-brand-200 bg-brand-50 text-brand-800" : "border-neutral-200 bg-neutral-50 text-neutral-700",
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        {title ? <p className="font-semibold">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}
