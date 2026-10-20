import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const DEFAULT_MIN_HEIGHT_PX = 320;
const BOTTOM_GAP_PX = 16;

interface ScrollTableProps {
  children: ReactNode;
  ariaLabel: string;
  className?: string;
  minHeight?: number;
}

export function ScrollTable({ children, ariaLabel, className = "", minHeight = DEFAULT_MIN_HEIGHT_PX }: ScrollTableProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef(0);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  const [scrolledX, setScrolledX] = useState(false);
  const [scrolledY, setScrolledY] = useState(false);

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    let frame = 0;

    const measure = () => {
      frame = 0;
      // Posição no documento: não muda quando a própria página rola.
      const documentTop = el.getBoundingClientRect().top + window.scrollY;
      setMaxHeight(Math.max(minHeight, window.innerHeight - documentTop - BOTTOM_GAP_PX));
      el.style.setProperty("--st-visible-w", `${el.clientWidth}px`);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };

    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    observer.observe(document.body);
    window.addEventListener("resize", schedule);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [minHeight]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== 0) cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollFrameRef.current !== 0) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = 0;
      const el = wrapperRef.current;
      if (!el) return;
      setScrolledX(el.scrollLeft > 0);
      setScrolledY(el.scrollTop > 0);
    });
  }, []);

  return (
    <div
      ref={wrapperRef}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      onScroll={handleScroll}
      data-scrolled-x={scrolledX}
      data-scrolled-y={scrolledY}
      style={{ maxHeight: maxHeight ?? undefined }}
      className={`st-wrap max-w-full overflow-auto ${className}`}
    >
      {children}
    </div>
  );
}
