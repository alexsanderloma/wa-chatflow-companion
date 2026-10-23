import { cn } from "@/lib/utils";

/** FLOWA's scalable, asset-free monogram. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className={cn("size-10 shrink-0 text-brand", className)}>
      <circle cx="24" cy="24" r="21.5" stroke="currentColor" strokeWidth=".85" />
      <path d="M16.5 35.5C18 29 17.8 23 19 17.5C19.8 13.8 23.2 12.2 32.5 13M18.3 24C22.2 22.2 26 22 30 22.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}