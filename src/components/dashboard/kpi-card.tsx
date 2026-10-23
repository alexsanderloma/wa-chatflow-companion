import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp } from "lucide-react";

export function KpiCard({
  icon, label, value, trend, accent, className,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  trend?: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "analytics-kpi min-w-0 rounded border p-3.5 sm:p-4",
        accent
          ? "border-brand/30 bg-card"
          : "border-border bg-card",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[12px] font-medium text-foreground/80">
        <span className="grid place-items-center text-brand">{icon}</span>
        <span className="leading-snug">{label}</span>
      </div>
      <div className="font-display font-medium mt-5 leading-tight text-2xl sm:text-[28px] break-words tabular-nums">
        {value}
      </div>
      {trend && (
        <div className="text-[11px] mt-3 pt-2 border-t border-border text-muted-foreground flex items-center gap-1.5 font-medium">
          <TrendingUp className="size-3.5" />
          <span>{trend}</span>
        </div>
      )}
    </div>
  );
}
