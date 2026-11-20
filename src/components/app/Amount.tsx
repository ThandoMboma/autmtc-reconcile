import { formatZAR } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

export function Amount({
  cents,
  signed,
  tone = "auto",
  className,
}: {
  cents: number;
  signed?: boolean;
  tone?: "auto" | "plain" | "muted";
  className?: string;
}) {
  const toneClass =
    tone === "muted" ? "text-muted-foreground" : tone === "plain" ? "" : cents > 0 && signed ? "text-incoming" : cents < 0 ? "text-outgoing" : "";
  return <span className={cn("font-figure whitespace-nowrap", toneClass, className)}>{formatZAR(cents, { signed })}</span>;
}
