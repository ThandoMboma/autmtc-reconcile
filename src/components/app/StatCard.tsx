import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: LucideIcon;
  emphasis?: boolean;
}) {
  return (
    <div className={cn("surface relative overflow-hidden p-5", emphasis && "bg-navy-gradient border-transparent text-primary-foreground")}>
      <div className="flex items-start justify-between gap-3">
        <div className={cn("eyebrow", emphasis && "text-sidebar-muted")}>{label}</div>
        {Icon && <Icon className={cn("size-4", emphasis ? "text-sidebar-primary" : "text-info")} strokeWidth={1.75} />}
      </div>
      <div className="mt-3 font-figure text-[26px] font-medium leading-none">{value}</div>
      {detail && <div className={cn("mt-3 text-xs", emphasis ? "text-sidebar-foreground" : "text-muted-foreground")}>{detail}</div>}
    </div>
  );
}
