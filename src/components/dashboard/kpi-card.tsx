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
        "min-w-0 rounded-lg border p-4 sm:p-6",
        accent
          ? "border-brand/30 bg-brand-soft"
          : "border-border bg-card",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[14px] font-medium text-foreground/80">
        <span className="grid place-items-center text-brand">{icon}</span>
        <span className="leading-snug">{label}</span>
      </div>
      <div className="font-display font-semibold mt-4 leading-tight text-2xl sm:text-3xl break-words">
        {value}
      </div>
      {trend && (
        <div className="text-[13px] mt-3 text-brand flex items-center gap-1.5 font-medium">
          <TrendingUp className="size-3.5" />
          <span>{trend}</span>
        </div>
      )}
    </div>
  );
}
