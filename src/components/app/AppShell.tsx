import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeftRight, BarChart3, FileText, LayoutDashboard, Menu, RotateCcw, ScaleIcon, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DEMO_BANK_ACCOUNT, DEMO_COMPANY } from "@/lib/data/sample-data";
import { CURRENT_REVIEWER, reconcileStore, useAnalysis } from "@/lib/store/store";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Bank transactions", icon: ArrowLeftRight },
  { to: "/invoices", label: "Invoice register", icon: FileText },
  { to: "/reconciliation", label: "Reconciliation", icon: ScaleIcon },
  { to: "/reports", label: "Reports", icon: BarChart3 },
] as const;

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { pending } = useAnalysis();
  return (
    <div className="flex h-full flex-col bg-navy-gradient text-sidebar-foreground">
      <div className="px-5 pb-6 pt-6">
        <Logo />
      </div>
      <div className="mx-5 ledger-rule opacity-30" />
      <nav className="mt-5 flex-1 space-y-0.5 px-3">
        <div className="eyebrow mb-2 px-3 text-sidebar-muted">Workspace</div>
        {NAV.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
                active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <span className={cn("h-4 w-0.5 rounded-full", active ? "bg-sidebar-primary" : "bg-transparent")} />
              <item.icon className={cn("size-4", active ? "text-sidebar-primary" : "text-sidebar-muted")} strokeWidth={1.75} />
              <span className="flex-1">{item.label}</span>
              {item.to === "/reconciliation" && pending.length > 0 && (
                <span className="rounded bg-sidebar-primary/20 px-1.5 py-0.5 font-figure text-[10px] text-sidebar-primary">{pending.length}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="m-3 rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-primary">
          <ShieldCheck className="size-3.5" /> Demo workspace
        </div>
        <div className="mt-2 text-xs font-medium text-sidebar-accent-foreground">{DEMO_COMPANY}</div>
        <p className="mt-1 text-[11px] leading-relaxed text-sidebar-muted">
          Fictional sample data. No bank connection, no payments, no changes to accounting records.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-sidebar-foreground/80 hover:text-sidebar-accent-foreground">
              <RotateCcw className="size-3" /> Reset sample data
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset the demo workspace?</AlertDialogTitle>
              <AlertDialogDescription>
                All imported files, approvals and rejections in this browser will be cleared and the fictional sample data restored.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  await reconcileStore.reset();
                  toast.success("Sample data restored");
                }}
              >
                Reset workspace
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <div className="border-t border-sidebar-border px-5 py-3 text-[10px] tracking-wider text-sidebar-muted">
        © {new Date().getFullYear()} AUTMTC GROUP
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[248px] lg:block">
        <SidebarContent />
      </aside>
      <div className="lg:pl-[248px]">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur md:px-8">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[260px] border-none p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarContent onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="flex min-w-0 flex-1 items-center gap-3 text-xs">
            <span className="truncate font-semibold text-foreground">{DEMO_COMPANY}</span>
            <span className="hidden text-border-strong sm:inline">/</span>
            <span className="hidden truncate text-muted-foreground sm:inline">{DEMO_BANK_ACCOUNT}</span>
            <span className="hidden rounded-full border border-border bg-muted px-2 py-0.5 font-medium text-muted-foreground md:inline">ZAR</span>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-warning/30 bg-warning-soft px-2.5 py-1 text-[11px] font-medium text-warning md:flex">
            <span className="size-1.5 rounded-full bg-warning" /> Demo mode · offline data
          </div>
          <div className="flex items-center gap-2 pl-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">FR</div>
            <div className="hidden text-xs leading-tight xl:block">
              <div className="font-medium text-foreground">{CURRENT_REVIEWER}</div>
              <div className="text-muted-foreground">Approver</div>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
