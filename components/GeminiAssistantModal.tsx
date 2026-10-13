'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  Zap,
  Brain,
  FileText,
  Copy,
  Check,
  X,
  Send,
  Loader2,
  Calendar,
} from 'lucide-react';
import { useBottomSheetDrag } from '@/lib/useBottomSheetDrag';
import { BottomSheetHandle } from '@/components/BottomSheetHandle';
import { getFirebaseIdToken } from '@/lib/auth';

interface GeminiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
  initialMode?: 'fast' | 'general' | 'thinking';
}

export function GeminiAssistantModal({
  isOpen,
  onClose,
  initialPrompt = '',
  initialMode = 'fast',
}: GeminiAssistantModalProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [mode, setMode] = useState<'fast' | 'general' | 'thinking'>(initialMode);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const aiSheet = useBottomSheetDrag({ isOpen, onClose });

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || loading) return;

    setLoading(true);
    setError(null);
    setResponse(null);
    setModelUsed(null);

    try {
      // El servidor exige un ID token de Firebase verificado (el endpoint consume cuota de la institución).
      const idToken = await getFirebaseIdToken();
      if (!idToken) {
        throw new Error('Para usar el asistente inicia sesión con Google (el acceso solo con email no habilita la IA).');
      }
      const res = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ prompt, mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Error al comunicarse con el asistente');
      }
      setResponse(data.text);
      setModelUsed(data.modelUsed);
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error inesperado');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!response) return;
    navigator.clipboard
      .writeText(response)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setError('No se pudo copiar al portapapeles. Selecciona el texto y cópialo manualmente.'));
  };

  const quickPrompts = [
    {
      title: 'Nota de Visita Escolar',
      prompt: 'Redactar una nota formal de respuesta y confirmación para una escuela secundaria que solicitó turno para el programa "Conociendo el Poder Legislativo". Indicar fecha, hora, punto de ingreso y pautas de seguridad.',
      mode: 'fast' as const,
      icon: Calendar,
    },
    {
      title: 'Resumen Ejecutivo de Agenda',
      prompt: 'Elaborar un resumen ejecutivo y conciso para la Dirección General con los puntos clave a coordinar para las actividades y visitas escolares de esta semana.',
      mode: 'fast' as const,
      icon: Zap,
    },
    {
      title: 'Gacetilla de Novedades',
      prompt: 'Redactar un comunicado oficial institucional para publicar en la portada de la intranet sobre el inicio de inscripciones para el nuevo curso de Técnica Legislativa.',
      mode: 'general' as const,
      icon: FileText,
    },
    {
      title: 'Diseño Curricular Profundo (High Thinking)',
      prompt: 'Diseñar un programa académico completo para el curso "Inteligencia Artificial y Ética en la Función Legislativa" (3 módulos, objetivos pedagógicos, bibliografía recomendada, rúbricas de evaluación y casos prácticos parlamentarios).',
      mode: 'thinking' as const,
      icon: Brain,
    },
  ];

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in overflow-hidden sm:overflow-y-auto overscroll-none"
    >
      <div
        data-bottom-sheet="true"
        style={aiSheet.sheetStyle}
        className="w-full sm:max-w-3xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain h-[88dvh] sm:h-auto sm:max-h-[90vh] flex flex-col animate-in fade-in duration-200"
      >
        {/* Header with touch drag */}
        <div
          {...aiSheet.dragBind}
          className="p-3.5 sm:p-4 bg-[#001428] text-white flex flex-col shrink-0 select-none touch-none sm:touch-auto cursor-grab active:cursor-grabbing sm:cursor-default"
        >
          <BottomSheetHandle
            {...aiSheet.dragBind}
            isExpanded={aiSheet.isExpanded}
            isDragging={aiSheet.isDragging}
            variant="dark"
            className="pt-1 pb-2"
          />
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-sky-400 shrink-0">
                <Sparkles className="w-4 h-4 text-sky-400" />
              </div>
              <div className="min-w-0">
                <h3 id="ai-modal-title" className="text-xs sm:text-sm font-bold text-white flex items-center gap-2 truncate">
                  <span>Asistencia de Redacción y Análisis</span>
                  <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-sky-950 text-sky-300 border border-sky-800 shrink-0 hidden sm:inline">
                    Gestión Interna
                  </span>
                </h3>
                <p className="text-[10px] sm:text-[11px] text-slate-300 truncate">
                  Redacción asistida de notas oficiales, gacetillas y análisis pedagógico
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              title="Cerrar ventana"
              aria-label="Cerrar ventana"
              className="hidden sm:flex p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body content */}
        <div className="p-3.5 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* Quick prompt badges */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Plantillas de consulta rápida:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {quickPrompts.map((qp, idx) => {
                const Icon = qp.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setPrompt(qp.prompt);
                      setMode(qp.mode);
                    }}
                    className="p-2.5 text-left rounded-lg border border-slate-200 hover:border-[#0284c7] hover:bg-blue-50/50 transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-[#001428] group-hover:text-[#0284c7]">
                      <Icon className="w-3.5 h-3.5 text-[#0284c7]" />
                      <span>{qp.title}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                      {qp.prompt}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="ai-prompt" className="text-xs font-bold text-[#001428]">
                  Instrucción o solicitud:
                </label>
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded border border-slate-200 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setMode('fast')}
                    className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                      mode === 'fast'
                        ? 'bg-[#001428] text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Rápido
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('general')}
                    className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                      mode === 'general'
                        ? 'bg-[#001428] text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Estándar
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('thinking')}
                    className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                      mode === 'thinking'
                        ? 'bg-[#001428] text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Razonamiento Curricular
                  </button>
                </div>
              </div>
              <textarea
                id="ai-prompt"
                rows={4}
                maxLength={10000}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Escribe aquí tu consulta, borrador de nota parlamentaria o pautas pedagógicas..."
                className="w-full text-xs p-3 rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none leading-relaxed text-slate-800"
              />
            </div>

            <div className="flex justify-between items-center pt-1">
              <span className="text-[11px] text-slate-400">
                Modelo asignado: <strong className="text-slate-600">{mode === 'fast' ? 'gemini-3.1-flash-lite' : mode === 'general' ? 'gemini-3.8-flash' : 'gemini-3.1-pro-preview'}</strong>
              </span>
              <button
                type="submit"
                disabled={loading || !prompt.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#001428] hover:bg-[#122a45] text-white text-xs font-bold rounded transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Generando...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Generar Respuesta</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Error notice */}
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          {/* Response Container */}
          {response && (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-[#0284c7]" />
                  <span className="text-xs font-bold text-[#001428]">
                    Respuesta Generada ({modelUsed})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="inline-flex items-center gap-1 text-xs text-[#0284c7] hover:underline font-semibold cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-600">¡Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copiar texto</span>
                    </>
                  )}
                </button>
              </div>
              <div className="text-xs text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
                {response}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
