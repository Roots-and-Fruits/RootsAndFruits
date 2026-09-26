"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

export function OrderActionBar({ children }: { children: ReactNode }) {
  const barRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const bar = barRef.current!;
    const root = document.documentElement;
    const previousHeight = root.style.getPropertyValue("--order-action-height");
    const viewport = window.visualViewport;
    let frame = 0;

    function measure() {
      root.style.setProperty("--order-action-height", `${bar.offsetHeight}px`);
    }
    function position() {
      // On-screen keyboards can shrink the visual viewport, leaving the layout
      // viewport unchanged. Keep the actions above that keyboard at normal zoom.
      const inset =
        viewport && viewport.scale === 1
          ? Math.max(
              0,
              window.innerHeight - viewport.height - viewport.offsetTop,
            )
          : 0;
      bar.style.bottom = `${inset}px`;
    }
    function resize() {
      position();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const field = document.activeElement;
        if (field instanceof HTMLInputElement && field.closest(".order-page")) {
          const bounds = field.getBoundingClientRect();
          const bottom = bar.getBoundingClientRect().top - 12;
          const top = (viewport?.offsetTop ?? 0) + 12;
          if (bounds.bottom > bottom)
            window.scrollBy({
              top: bounds.bottom - bottom,
              behavior: "instant",
            });
          else if (bounds.top < top)
            window.scrollBy({ top: bounds.top - top, behavior: "instant" });
        }
      });
    }

    measure();
    position();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", position);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", position);
      window.removeEventListener("resize", resize);
      if (previousHeight)
        root.style.setProperty("--order-action-height", previousHeight);
      else root.style.removeProperty("--order-action-height");
    };
  }, []);

  return (
    <div
      ref={barRef}
      data-order-actions
      role="region"
      aria-label="주문 진행 버튼"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card shadow-[0_-4px_20px_#25382e08]"
    >
      <div className="mx-auto max-w-6xl px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-10 sm:pt-4 sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="lg:ml-[336px]">{children}</div>
      </div>
    </div>
  );
}
