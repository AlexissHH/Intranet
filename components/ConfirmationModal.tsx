'use client';

import React from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { useBottomSheetDrag } from '@/lib/useBottomSheetDrag';
import { BottomSheetHandle } from '@/components/BottomSheetHandle';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  itemDetails?: { label: string; value: string }[];
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ConfirmationModal({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  isDestructive = false,
  itemDetails,
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmationModalProps) {
  const confirmSheet = useBottomSheetDrag({
    isOpen,
    onClose: () => {
      if (!isLoading) onCancel();
    },
    isAutoHeight: true,
  });

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onCancel();
      }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirmation-modal-title"
      aria-describedby="confirmation-modal-description"
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden sm:overflow-y-auto overscroll-none"
    >
      <div
        data-bottom-sheet="true"
        style={confirmSheet.sheetStyle}
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain max-h-[92dvh] sm:max-h-[90vh] flex flex-col animate-in fade-in sm:zoom-in-95 duration-200"
      >
        <BottomSheetHandle
          {...confirmSheet.dragBind}
          isExpanded={confirmSheet.isExpanded}
          isDragging={confirmSheet.isDragging}
        />
        {/* Header */}
        <div
          {...confirmSheet.dragBind}
          className="p-4 sm:p-6 pb-3 sm:pb-4 bg-white border-b border-slate-100 flex items-start gap-3 shrink-0 select-none touch-none sm:touch-auto cursor-grab active:cursor-grabbing sm:cursor-default"
        >
          <div className={`p-2 rounded-lg shrink-0 ${isDestructive ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="confirmation-modal-title" className="text-sm sm:text-base font-bold text-[#001428] leading-snug">{title}</h3>
            <p id="confirmation-modal-description" className="text-xs mt-1 leading-relaxed text-slate-500">{description}</p>
          </div>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="hidden sm:flex text-slate-400 hover:text-slate-800 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ml-1"
            title="Cerrar ventana"
            aria-label="Cerrar ventana"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Details list if any */}
        {itemDetails && itemDetails.length > 0 && (
          <div className="p-3.5 sm:p-5 bg-white border-b border-slate-100 space-y-2 overflow-y-auto flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#0284c7]">Detalles de la operación:</p>
            <div className="bg-slate-50 rounded-lg p-3 space-y-1.5 border border-slate-200 text-xs">
              {itemDetails.map((item, idx) => (
                <div key={idx} className="flex justify-between items-start text-xs gap-2">
                  <span className="text-slate-500 font-medium shrink-0">{item.label}:</span>
                  <span className="text-slate-800 font-semibold break-words min-w-0 text-right">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="p-3.5 sm:p-4 bg-white border-t border-slate-100 flex flex-col-reverse sm:flex-row items-center justify-end gap-2 shrink-0 mt-auto">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="w-full sm:w-auto text-center px-4 py-2.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold transition-colors cursor-pointer border border-slate-200 sm:border-transparent"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-lg text-white shadow-xs transition-colors cursor-pointer ${
              isDestructive
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-[#001428] hover:bg-[#0e4a7b]'
            }`}
          >
            {isLoading ? (
              <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
