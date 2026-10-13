'use client';

import React from 'react';
import Image from 'next/image';

interface LegislaturaLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function LegislaturaLogo({ className = '', size = 'md' }: LegislaturaLogoProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-9 h-9 sm:w-10 sm:h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  }[size];

  const px = size === 'sm' ? 32 : size === 'md' ? 40 : size === 'lg' ? 48 : 64;

  return (
    <div
      className={`rounded-lg bg-white border border-slate-200/90 shadow-2xs overflow-hidden flex items-center justify-center p-0.5 shrink-0 transition-transform ${sizeClasses} ${className}`}
    >
      <Image
        src="/logo_legislatura.jpg"
        alt="Honorable Legislatura de Tucumán"
        width={px}
        height={px}
        className="w-full h-full object-contain"
        referrerPolicy="no-referrer"
        priority
      />
    </div>
  );
}
