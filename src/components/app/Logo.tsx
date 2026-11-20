import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden="true">
      <rect x="0.5" y="0.5" width="31" height="31" rx="6" className="fill-sidebar-accent stroke-sidebar-border" />
      <path d="M8 22 L13.5 10 L19 22" className="stroke-sidebar-foreground" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 17.5 L20 20.5 L25.5 12" className="stroke-sidebar-primary" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <LogoMark />
      <div className="leading-none">
        <div className="text-[13px] font-bold tracking-[0.2em] text-sidebar-accent-foreground">AUTMTC</div>
        <div className="mt-1 font-serif text-[15px] italic text-sidebar-foreground">Reconcile</div>
      </div>
    </div>
  );
}
