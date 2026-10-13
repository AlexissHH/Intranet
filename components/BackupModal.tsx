'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Download, Upload, RefreshCw, X, Check, AlertCircle, Database } from 'lucide-react';
import { exportAllData, importAllDataDetailed, resetAllData } from '@/lib/storage';
import { getLocalDateString } from '@/lib/utils';
import { useBottomSheetDrag } from '@/lib/useBottomSheetDrag';
import { BottomSheetHandle } from '@/components/BottomSheetHandle';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChanged: () => void;
}

export function BackupModal({ isOpen, onClose, onDataChanged }: BackupModalProps) {
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [isConfirmingImport, setIsConfirmingImport] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const backupSheet = useBottomSheetDrag({ isOpen, onClose });

  // Estado limpio en cada apertura (antes quedaban el texto pegado y el último mensaje).
  useEffect(() => {
    if (!isOpen) return;
    setImportText('');
    setMsg(null);
    setIsConfirmingReset(false);
    setIsConfirmingImport(false);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const closeSoon = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => onClose(), 1500);
  };

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDownloadBackup = () => {
    const jsonStr = exportAllData();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `respaldo_intranet_capacitacion_${getLocalDateString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setMsg({ type: 'success', text: 'Copia de seguridad descargada exitosamente en formato JSON.' });
  };

  const MAX_FILE_BYTES = 8 * 1024 * 1024;

  const handlePickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setMsg({ type: 'error', text: 'El archivo es demasiado grande para importarse (máximo 8 MB).' });
      return;
    }
    try {
      setImportText(await file.text());
      setIsConfirmingImport(false);
      setMsg(null);
    } catch {
      setMsg({ type: 'error', text: 'No se pudo leer el archivo seleccionado.' });
    }
  };

  const handleImport = () => {
    setIsConfirmingImport(false);
    if (!importText.trim()) return;
    const result = importAllDataDetailed(importText);
    if (result.ok) {
      setMsg({ type: 'success', text: '¡Datos importados con éxito! Actualizando la intranet...' });
      onDataChanged();
      closeSoon();
    } else {
      setMsg({ type: 'error', text: result.error || 'El formato del archivo JSON no es válido o está incompleto.' });
    }
  };

  const handleExecuteReset = () => {
    resetAllData();
    onDataChanged();
    setIsConfirmingReset(false);
    setMsg({ type: 'success', text: 'Datos restablecidos a los valores predeterminados del Instituto.' });
    closeSoon();
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-modal-title"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden sm:overflow-y-auto overscroll-none"
    >
      <div
        data-bottom-sheet="true"
        style={backupSheet.sheetStyle}
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain h-[88dvh] sm:h-auto sm:max-h-[90vh] flex flex-col animate-in fade-in sm:zoom-in-95 duration-200"
      >
        <BottomSheetHandle
          {...backupSheet.dragBind}
          isExpanded={backupSheet.isExpanded}
          isDragging={backupSheet.isDragging}
        />
        <div
          {...backupSheet.dragBind}
          className="p-4 sm:p-6 pb-3 sm:pb-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 select-none touch-none sm:touch-auto cursor-grab active:cursor-grabbing sm:cursor-default"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Database className="w-5 h-5 text-[#001428] shrink-0" />
            <div className="min-w-0">
              <h3 id="backup-modal-title" className="text-sm sm:text-base font-bold text-[#001428] tracking-tight truncate">Gestor de Datos y Respaldo</h3>
              <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">Guarda o restaura la información de la intranet</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="hidden sm:flex text-slate-400 hover:text-slate-800 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ml-2"
            title="Cerrar ventana"
            aria-label="Cerrar ventana"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 sm:p-5 space-y-4 text-xs text-slate-800 overflow-y-auto flex-1">
          {msg && (
            <div
              className={`p-2.5 rounded text-xs flex items-center gap-2 ${
                msg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {msg.type === 'success' ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
              <span>{msg.text}</span>
            </div>
          )}

          <div className="p-3.5 bg-slate-50 rounded border border-slate-200 space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#0284c7]">Exportar Copia de Seguridad</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Descarga un archivo con las actividades, novedades, cursos, programas, recursos, enlaces, equipo, áreas, ajustes institucionales y auditorías de cursadas. No incluye la lista de usuarios autorizados.
            </p>
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 leading-relaxed">
              El archivo contiene datos personales del equipo (contactos y fechas de nacimiento): guárdalo en un lugar seguro y no lo compartas.
            </p>
            <button
              onClick={handleDownloadBackup}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#001428] hover:bg-[#122a45] text-white text-xs font-bold rounded cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar Archivo JSON</span>
            </button>
          </div>

          <div className="p-3.5 bg-slate-50 rounded border border-slate-200 space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#0284c7]">Restaurar / Importar Copia</h4>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Elegir archivo .json</span>
              <input type="file" accept="application/json,.json" onChange={handlePickFile} className="sr-only" />
            </label>
            <textarea
              rows={3}
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                setIsConfirmingImport(false);
              }}
              aria-label="Contenido JSON del respaldo"
              placeholder="Pega aquí el contenido JSON del respaldo..."
              className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none font-mono"
            />
            {isConfirmingImport ? (
              <div className="p-3 rounded bg-amber-50 border border-amber-200 space-y-2 text-amber-900">
                <p className="text-xs font-semibold">
                  Importar reemplazará los datos actuales de las secciones incluidas en el archivo. ¿Continuar?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleImport}
                    className="px-3 py-1 bg-[#001428] hover:bg-[#122a45] text-white rounded text-xs font-bold cursor-pointer"
                  >
                    Sí, importar
                  </button>
                  <button
                    onClick={() => setIsConfirmingImport(false)}
                    className="px-3 py-1 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsConfirmingImport(true)}
                disabled={!importText.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Importar y Aplicar</span>
              </button>
            )}
          </div>

          <div className="pt-2 border-t border-slate-200">
            {isConfirmingReset ? (
              <div className="p-3 rounded bg-rose-50 border border-rose-200 space-y-2 text-rose-800">
                <p className="text-xs font-semibold">
                  ¿Seguro de restablecer todos los datos del Instituto a su estado original? Se borrarán actividades, novedades, cursos, recursos, equipo, ajustes y también las auditorías de cursadas (certificados y encuestas). Descarga un respaldo antes si lo necesitas.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExecuteReset}
                    className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold cursor-pointer"
                  >
                    Sí, Restablecer
                  </button>
                  <button
                    onClick={() => setIsConfirmingReset(false)}
                    className="px-3 py-1 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center text-slate-500">
                <span className="text-[11px]">¿Deseas volver a los datos originales?</span>
                <button
                  onClick={() => setIsConfirmingReset(true)}
                  className="inline-flex items-center gap-1 text-xs text-rose-600 hover:underline cursor-pointer font-semibold"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Restablecer iniciales</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
