import { useEffect, useRef } from 'react';

export function usePullToRefresh(onRefresh, containerRef) {
  const startY = useRef(0);
  const pulling = useRef(false);
  useEffect(() => {
    const el = containerRef?.current;
    if (!el) return;
    const onTouchStart = (e) => { startY.current = e.touches[0].clientY; pulling.current = el.scrollTop === 0; };
    const onTouchEnd = (e) => {
      if (!pulling.current) return;
      const diff = e.changedTouches[0].clientY - startY.current;
      if (diff > 80) onRefresh();
      pulling.current = false;
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => { el.removeEventListener('touchstart', onTouchStart); el.removeEventListener('touchend', onTouchEnd); };
  }, [onRefresh, containerRef]);
}