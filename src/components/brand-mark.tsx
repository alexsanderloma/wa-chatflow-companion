import { cn } from "@/lib/utils";

/** FLOWA's scalable, asset-free monogram. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className={cn("size-10 shrink-0 text-brand", className)}>
      <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1" />
      <path d="M17 35V19C17 14.5 20 12 25 12H33M17 24C21 21.5 25 21.5 30 22" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}