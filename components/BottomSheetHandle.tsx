'use client';

import React from 'react';

interface BottomSheetHandleProps extends React.HTMLAttributes<HTMLDivElement> {
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
  className?: string;
  isExpanded?: boolean;
  isDragging?: boolean;
  variant?: 'light' | 'dark';
}

export function BottomSheetHandle({
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  className = '',
  isExpanded = false,
  isDragging = false,
  variant = 'light',
  ...rest
}: BottomSheetHandleProps) {
  const pillColor =
    variant === 'dark'
      ? isDragging
        ? 'bg-sky-300 scale-x-110'
        : 'bg-slate-400/70 hover:bg-slate-300 active:bg-sky-300 active:scale-x-110'
      : isDragging
      ? 'bg-[#0284c7] scale-x-110'
      : 'bg-slate-300 hover:bg-slate-400 active:bg-[#0284c7] active:scale-x-110';

  return (
    <div
      data-bottom-sheet-drag="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      className={`w-full pt-3.5 pb-2.5 sm:hidden flex flex-col items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none shrink-0 ${className}`}
      title={
        isExpanded
          ? 'Desliza con el dedo hacia abajo para bajar o cerrar'
          : 'Desliza con el dedo hacia arriba o hacia abajo para mover'
      }
      aria-label="Indicador de arrastre táctil para subir, bajar o cerrar ventana"
      role="separator"
      aria-orientation="horizontal"
      {...rest}
    >
      <div className={`w-14 h-1.5 ${pillColor} rounded-full transition-all duration-150 pointer-events-none`} />
      <span className="sr-only">Deslizar con el dedo hacia arriba o hacia abajo para mover o cerrar</span>
    </div>
  );
}
