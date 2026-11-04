import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface AdminMetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  iconVariant?: "gold" | "emerald" | "blue" | "purple" | "amber";
  href?: string;
  actionText?: string;
  className?: string;
}

export function AdminMetricCard({
  title,
  value,
  subtitle,
  icon,
  iconVariant = "gold",
  href,
  actionText,
  className,
}: AdminMetricCardProps) {
  const iconVariants = {
    gold: "bg-[#C9A24A]/10 border-[#C9A24A]/30 text-[#C9A24A]",
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
    blue: "bg-blue-500/10 border-blue-500/30 text-blue-400",
    purple: "bg-purple-500/10 border-purple-500/30 text-purple-400",
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-400",
  };

  const cardContent = (
    <div
      className={cn(
        "bg-[#161616] border border-[#2A2A2A] rounded-xl p-5 sm:p-6 transition-all duration-[var(--duration-card)] [transition-timing-function:var(--ease-luxury)] relative overflow-hidden group",
        href && "hover:border-[#C9A24A]/50 hover:-translate-y-1 hover:shadow-luxury-hover hover:bg-[#1A1A1A] cursor-pointer",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          {title}
        </span>
        {icon && (
          <div
            className={cn(
              "w-9 h-9 rounded-lg border flex items-center justify-center text-sm font-serif font-bold transition-transform duration-[var(--duration-button)] [transition-timing-function:var(--ease-luxury)] group-hover:scale-105",
              iconVariants[iconVariant]
            )}
          >
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          {value}
        </h3>
        {actionText && href && (
          <span className="text-xs text-neutral-500 group-hover:text-[#C9A24A] transition-colors flex items-center gap-1">
            {actionText}
          </span>
        )}
      </div>

      {subtitle && (
        <p className="text-xs text-neutral-400 mt-1 font-light">
          {subtitle}
        </p>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{cardContent}</Link>;
  }

  return cardContent;
}

