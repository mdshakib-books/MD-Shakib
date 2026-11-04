"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface ScrollRevealProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  threshold?: number;
  as?: React.ElementType;
}

export function ScrollReveal({
  children,
  className,
  delay = 0,
  threshold = 0.1,
  as: Component = "div",
  style,
  ...props
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    // Fallback if IntersectionObserver is unsupported in the client environment
    if (typeof IntersectionObserver === "undefined") {
      const timer = setTimeout(() => setIsRevealed(true), 0);
      return () => clearTimeout(timer);
    }

    const currentEl = ref.current;
    if (!currentEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry && entry.isIntersecting) {
          setIsRevealed(true);
          observer.unobserve(entry.target);
          observer.disconnect();
        }
      },
      {
        threshold,
        rootMargin: "0px 0px -30px 0px",
      }
    );

    observer.observe(currentEl);

    return () => {
      observer.disconnect();
    };
  }, [threshold]);

  const transitionDelayStyle =
    delay > 0 ? { transitionDelay: `${delay}ms`, ...style } : style;

  return (
    <Component
      ref={ref}
      className={cn("reveal-init", isRevealed && "reveal-visible", className)}
      style={transitionDelayStyle}
      {...props}
    >
      {children}
    </Component>
  );
}
