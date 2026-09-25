import { useEffect, useRef, useState } from "react";

export function useOverflowTitle<T extends HTMLElement>(text: string) {
  const ref = useRef<T>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => setIsOverflowing(element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  return { ref, title: isOverflowing ? text : undefined };
}
