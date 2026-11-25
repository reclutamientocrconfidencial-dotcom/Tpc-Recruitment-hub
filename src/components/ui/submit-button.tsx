"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SubmitButton({
  children,
  pendingText = "Guardando…",
  variant = "primary",
  className,
  disabled,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "dark" | "ghost";
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {pending ? pendingText : children}
    </Button>
  );
}
