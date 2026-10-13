'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

interface UseBottomSheetDragOptions {
  onClose: () => void;
  isOpen?: boolean;
  initialHeightVh?: number;
  maxHeightVh?: number;
  isAutoHeight?: boolean;
}

// Reference-counted background scroll lock so nested modals never unlock early
let activeModalLocks = 0;
let savedHtmlOverflow = '';
let savedBodyOverflow = '';
let savedHtmlOverscroll = '';
let savedBodyOverscroll = '';

function lockBackgroundScroll() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (activeModalLocks === 0) {
    const html = document.documentElement;
    const body = document.body;
    savedHtmlOverflow = html.style.overflow;
    savedBodyOverflow = body.style.overflow;
    savedHtmlOverscroll = html.style.overscrollBehavior;
    savedBodyOverscroll = body.style.overscrollBehavior;

    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
  }
  activeModalLocks++;
}

function unlockBackgroundScroll() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (activeModalLocks <= 0) return;
  activeModalLocks--;
  if (activeModalLocks === 0) {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = savedHtmlOverflow;
    html.style.overscrollBehavior = savedHtmlOverscroll;
    body.style.overflow = savedBodyOverflow;
    body.style.overscrollBehavior = savedBodyOverscroll;
  }
}

export function useBottomSheetDrag({
  onClose,
  isOpen = true,
  initialHeightVh = 88,
  maxHeightVh = 96,
  isAutoHeight = false,
}: UseBottomSheetDragOptions) {
  const [dragTranslateY, setDragTranslateY] = useState(0);
  const [extraHeightPx, setExtraHeightPx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const startYRef = useRef(0);
  const lastYRef = useRef(0);
  const lastTimeRef = useRef(0);
  const velocityYRef = useRef(0);
  const currentTranslateYRef = useRef(0);
  const isTrackingRef = useRef(false);
  const isClosingRef = useRef(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Quita los listeners de ventana de un gesto en curso (se usa al terminar y al desmontar).
  const detachWindowListenersRef = useRef<(() => void) | null>(null);
  // Siempre la última versión de onClose, sin recrear los handlers en cada render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Al desmontar: cancelar el cierre diferido y soltar cualquier listener de ventana pendiente.
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
      detachWindowListenersRef.current?.();
      detachWindowListenersRef.current = null;
    };
  }, []);

  // Manage background scroll lock
  useEffect(() => {
    if (!isOpen) {
      isTrackingRef.current = false;
      isClosingRef.current = false;
      currentTranslateYRef.current = 0;
      return;
    }

    lockBackgroundScroll();
    return () => {
      unlockBackgroundScroll();
    };
  }, [isOpen]);

  const moveTracking = useCallback(
    (clientY: number) => {
      if (!isTrackingRef.current || isClosingRef.current) return;
      const now = performance.now();
      const dt = now - lastTimeRef.current;
      if (dt > 0) {
        const instantVel = (clientY - lastYRef.current) / dt;
        velocityYRef.current = velocityYRef.current * 0.35 + instantVel * 0.65;
      }
      lastYRef.current = clientY;
      lastTimeRef.current = now;

      const deltaY = clientY - startYRef.current;

      if (deltaY >= 0) {
        // Dragging DOWN: move sheet down in real time (1:1 with finger)
        currentTranslateYRef.current = deltaY;
        setDragTranslateY(deltaY);
        setExtraHeightPx(0);
      } else {
        // Pulling UP: expand height if not auto-height
        currentTranslateYRef.current = 0;
        setDragTranslateY(0);
        if (!isAutoHeight && typeof window !== 'undefined') {
          const vh = window.innerHeight || 800;
          const maxExtra = Math.max(0, ((maxHeightVh - initialHeightVh) / 100) * vh);
          const desired = Math.min(maxExtra, -deltaY);
          setExtraHeightPx(desired);
        }
      }
    },
    [initialHeightVh, isAutoHeight, maxHeightVh]
  );

  const endTracking = useCallback(() => {
    if (!isTrackingRef.current) return;
    isTrackingRef.current = false;
    setIsDragging(false);

    const deltaY = lastYRef.current - startYRef.current;
    const velocity = velocityYRef.current;

    // Thresholds: intentional downward drag > 80px or quick downward flick > 0.45 px/ms with at least 30px move
    const shouldClose = deltaY > 80 || (velocity > 0.45 && deltaY > 30);

    if (shouldClose) {
      isClosingRef.current = true;
      const vh = typeof window !== 'undefined' ? window.innerHeight || 800 : 800;
      setDragTranslateY(vh);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = setTimeout(() => {
        closeTimeoutRef.current = null;
        isClosingRef.current = false;
        currentTranslateYRef.current = 0;
        setDragTranslateY(0);
        setExtraHeightPx(0);
        onCloseRef.current();
      }, 220);
    } else {
      // Snap cleanly back to resting position
      currentTranslateYRef.current = 0;
      setDragTranslateY(0);
      setExtraHeightPx(0);
    }
  }, []);

  const startTracking = useCallback((clientY: number) => {
    if (isClosingRef.current) return;
    startYRef.current = clientY;
    lastYRef.current = clientY;
    lastTimeRef.current = performance.now();
    velocityYRef.current = 0;
    currentTranslateYRef.current = 0;
    isTrackingRef.current = true;
    setIsDragging(true);
  }, []);

  // Primary native-level touch gesture handler
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest('button, a, input, select, textarea')) return;

      startTracking(e.touches[0].clientY);

      const onWindowTouchMove = (evt: TouchEvent) => {
        if (!isTrackingRef.current) return;
        if (evt.cancelable) {
          evt.preventDefault(); // Prevents Android Chrome from hijacking scroll or canceling pointer
        }
        if (evt.touches.length === 1) {
          moveTracking(evt.touches[0].clientY);
        }
      };

      const detach = () => {
        window.removeEventListener('touchmove', onWindowTouchMove);
        window.removeEventListener('touchend', onWindowTouchEnd);
        window.removeEventListener('touchcancel', onWindowTouchEnd);
        if (detachWindowListenersRef.current === detach) detachWindowListenersRef.current = null;
      };

      const onWindowTouchEnd = () => {
        detach();
        endTracking();
      };

      detachWindowListenersRef.current?.();
      detachWindowListenersRef.current = detach;
      window.addEventListener('touchmove', onWindowTouchMove, { passive: false });
      window.addEventListener('touchend', onWindowTouchEnd);
      window.addEventListener('touchcancel', onWindowTouchEnd);
    },
    [startTracking, moveTracking, endTracking]
  );

  // Mouse/pointer gesture handler for desktop
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'touch') {
        // Touch is handled with 100% reliability by handleTouchStart!
        return;
      }
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest('button, a, input, select, textarea')) return;

      startTracking(e.clientY);

      const onWindowPointerMove = (evt: PointerEvent) => {
        if (!isTrackingRef.current) return;
        moveTracking(evt.clientY);
      };

      const detach = () => {
        window.removeEventListener('pointermove', onWindowPointerMove);
        window.removeEventListener('pointerup', onWindowPointerUp);
        window.removeEventListener('pointercancel', onWindowPointerUp);
        if (detachWindowListenersRef.current === detach) detachWindowListenersRef.current = null;
      };

      const onWindowPointerUp = () => {
        detach();
        endTracking();
      };

      detachWindowListenersRef.current?.();
      detachWindowListenersRef.current = detach;
      window.addEventListener('pointermove', onWindowPointerMove);
      window.addEventListener('pointerup', onWindowPointerUp);
      window.addEventListener('pointercancel', onWindowPointerUp);
    },
    [startTracking, moveTracking, endTracking]
  );

  // Fallback direct handlers for compatibility
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (isTrackingRef.current) moveTracking(e.clientY);
    },
    [moveTracking]
  );

  const handlePointerUp = useCallback(() => {
    if (isTrackingRef.current) endTracking();
  }, [endTracking]);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (isTrackingRef.current && e.touches.length === 1) {
        moveTracking(e.touches[0].clientY);
      }
    },
    [moveTracking]
  );

  const handleTouchEnd = useCallback(() => {
    if (isTrackingRef.current) endTracking();
  }, [endTracking]);

  const isExpanded = extraHeightPx > 20;

  const sheetStyle: React.CSSProperties = {
    ...(isAutoHeight
      ? {}
      : {
          height:
            extraHeightPx > 0
              ? `calc(${initialHeightVh}dvh + ${Math.round(extraHeightPx)}px)`
              : undefined,
          maxHeight: `${maxHeightVh}dvh`,
        }),
    transform:
      dragTranslateY !== 0 ? `translate3d(0, ${Math.round(dragTranslateY)}px, 0)` : undefined,
    willChange: isDragging ? 'transform' : undefined,
    transition: isDragging
      ? 'none'
      : 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1), height 0.22s ease',
  };

  const dragBind = {
    'data-bottom-sheet-drag': 'true',
    // El seguimiento del gesto (move/up/cancel) se engancha a window al empezar, así que aquí
    // solo hacen falta los handlers de inicio; los de move/up del elemento duplicaban el trabajo.
    onTouchStart: handleTouchStart,
    onPointerDown: handlePointerDown,
  };

  return {
    dragY: dragTranslateY,
    isDragging,
    isExpanded,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    dragBind,
    sheetStyle,
  };
}
