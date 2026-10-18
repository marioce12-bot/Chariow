import { useEffect, useRef, useState } from "react";

const DIRECTION_THRESHOLD = 14;
const TOP_RESET = 8;

export function shouldToggleMobileNav(accumulatedDelta: number, visible: boolean) {
  return visible ? accumulatedDelta >= DIRECTION_THRESHOLD : accumulatedDelta <= -DIRECTION_THRESHOLD;
}

/** Tracks the document viewport only; scroll events from nested dialogs/lists never reach this listener. */
export function useMobileNavVisibility(section: string) {
  const [visible, setVisible] = useState(true);
  const visibleRef = useRef(true);
  const lastY = useRef(0);
  const accumulated = useRef(0);

  useEffect(() => {
    const reveal = () => {
      visibleRef.current = true;
      setVisible(true);
      accumulated.current = 0;
    };
    const onScroll = () => {
      if (window.matchMedia && !window.matchMedia("(max-width: 760px)").matches) return;
      const y = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
      if (y <= TOP_RESET) {
        reveal();
        lastY.current = y;
        return;
      }
      const delta = y - lastY.current;
      lastY.current = y;
      if (!delta) return;
      if (Math.sign(delta) !== Math.sign(accumulated.current)) accumulated.current = 0;
      accumulated.current += delta;
      if (shouldToggleMobileNav(accumulated.current, visibleRef.current) && visibleRef.current) {
        visibleRef.current = false;
        setVisible(false);
        accumulated.current = 0;
      } else if (shouldToggleMobileNav(accumulated.current, visibleRef.current) && !visibleRef.current) {
        reveal();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if ((event.target as Element | null)?.closest(".mobile-nav")) reveal();
    };
    lastY.current = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  useEffect(() => {
    visibleRef.current = true;
    setVisible(true);
    accumulated.current = 0;
    lastY.current = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
  }, [section]);

  return visible;
}
