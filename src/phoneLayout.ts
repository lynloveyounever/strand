import { useEffect, useState } from 'react';

/** A rotated phone keeps its touch workspace instead of opening desktop sidebars. */
export function isPhoneLayout(width: number, height: number, coarsePointer = false) {
  return width <= 760 || (coarsePointer && width <= 1100 && height <= 560);
}

export function phoneLayoutNow() {
  return isPhoneLayout(window.innerWidth, window.innerHeight, window.matchMedia?.('(pointer: coarse)').matches ?? false);
}

export function usePhoneLayout() {
  const [phone, setPhone] = useState(phoneLayoutNow);
  useEffect(() => {
    const measure = () => setPhone(phoneLayoutNow());
    const pointer = window.matchMedia?.('(pointer: coarse)');
    window.addEventListener('resize', measure);
    pointer?.addEventListener?.('change', measure);
    return () => { window.removeEventListener('resize', measure); pointer?.removeEventListener?.('change', measure); };
  }, []);
  useEffect(() => {
    if (!phone) return;
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const measure = () => {
      // Do not turn pinch zoom into a layout resize. Keyboard resize remains at scale 1.
      if (viewport && Math.abs(viewport.scale - 1) >= .01) return;
      root.style.setProperty('--phone-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      root.style.setProperty('--phone-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    };
    measure();
    window.addEventListener('resize', measure);
    viewport?.addEventListener('resize', measure);
    viewport?.addEventListener('scroll', measure);
    return () => {
      window.removeEventListener('resize', measure);
      viewport?.removeEventListener('resize', measure);
      viewport?.removeEventListener('scroll', measure);
      root.style.removeProperty('--phone-viewport-height');
      root.style.removeProperty('--phone-viewport-top');
    };
  }, [phone]);
  return phone;
}
