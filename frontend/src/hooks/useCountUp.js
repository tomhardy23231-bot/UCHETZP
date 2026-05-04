// hooks/useCountUp.js — анимированный счётчик
// Считает от прошлого значения к новому за durationMs мс с ease-out.
// На первом рендере анимирует от 0. При обновлении target — от прошлого target к новому
// (а не от 0 → новому), чтобы при поллинге не скакать туда-сюда.
import { useEffect, useRef, useState } from 'react';

export function useCountUp(target, durationMs = 800) {
  const safeTarget = typeof target === 'number' && Number.isFinite(target) ? target : 0;
  const [value, setValue] = useState(0);
  const prevTargetRef = useRef(0);

  useEffect(() => {
    const from = prevTargetRef.current;
    const to = safeTarget;
    if (from === to) {
      setValue(to);
      return;
    }

    const start = performance.now();
    let raf;
    const step = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (to - from) * eased);
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        setValue(to);
        prevTargetRef.current = to;
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [safeTarget, durationMs]);

  return value;
}
