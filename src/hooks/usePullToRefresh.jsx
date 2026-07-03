import { useEffect, useRef, useState } from 'react';

export function usePullToRefresh(onRefresh, containerRef) {
  const startY = useRef(0);
  const pulling = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const el = containerRef?.current;
    if (!el) return;
    const onTouchStart = (e) => { startY.current = e.touches[0].clientY; pulling.current = el.scrollTop === 0; };
    const onTouchEnd = async (e) => {
      if (!pulling.current) return;
      pulling.current = false;
      const diff = e.changedTouches[0].clientY - startY.current;
      if (diff > 80) {
        setIsRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
        }
      }
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => { el.removeEventListener('touchstart', onTouchStart); el.removeEventListener('touchend', onTouchEnd); };
  }, [onRefresh, containerRef]);

  return isRefreshing;
}