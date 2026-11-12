'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Download, Loader2, Trash2, AlertTriangle, RefreshCw, CalendarDays } from 'lucide-react';
import type { ActivityItem } from '@/lib/mock-data';
import { listUpcomingCalendarEvents, WorkspaceAuthError } from '@/lib/workspace';
import {
  IMPORT_TYPE_LABELS,
  buildImportCandidates,
  draftToActivity,
  validateDraft,
  type CalendarImportDraft,
  type CalendarImportSkipped,
  type ImportActivityType,
} from '@/lib/calendar-import';
import { buildSafeIsoDateTime, getErrorMessage, getLocalDateString } from '@/lib/utils';
import { useBottomSheetDrag } from '@/lib/useBottomSheetDrag';
import { BottomSheetHandle } from '@/components/BottomSheetHandle';
import { VISIT_LEVEL_OPTIONS } from '@/components/QuickActionsModal';

interface CalendarImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Token de Google con permiso de Calendar (la lectura se hace con la cuenta conectada). */
  accessToken: string | null;
  /** Cuenta de Google conectada: es el calendario principal que se lee. Solo se muestra. */
  accountEmail: string;
  /** Actividades ya cargadas: sirven para no volver a proponer lo que ya está en la agenda. */
  existingActivities: ActivityItem[];
  onImport: (items: ActivityItem[]) => void;
  /** El token venció o fue rechazado: quien abre la ventana pide reconectar. */
  onAuthError: () => void;
}

const COUNT_OPTIONS = [10, 20] as const;
/** Se piden más eventos de los necesarios para que, al omitir los que ya están en la agenda, alcance el cupo. */
const FETCH_LIMIT = 250;

const INPUT_CLASS =
  'w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none bg-white font-medium';
const LABEL_CLASS = 'block text-[11px] font-bold text-[#001428] mb-1';

type LoadStatus = 'loading' | 'ready' | 'error';

export function CalendarImportModal({
  isOpen,
  onClose,
  accessToken,
  accountEmail,
  existingActivities,
  onImport,
  onAuthError,
}: CalendarImportModalProps) {
  const { isExpanded, isDragging, dragBind, sheetStyle } = useBottomSheetDrag({ isOpen, onClose });
  const [count, setCount] = useState<(typeof COUNT_OPTIONS)[number]>(10);
  const [reloadTick, setReloadTick] = useState(0);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<CalendarImportDraft[]>([]);
  const [skipped, setSkipped] = useState<CalendarImportSkipped | null>(null);

  // Lee el calendario al abrir, al cambiar la cantidad o al pedir "Volver a leer". `existingActivities` no es
  // dependencia a propósito: si cambia con la ventana abierta (sincronización) no debe descartar las ediciones.
  useEffect(() => {
    if (!isOpen) return;
    if (!accessToken) {
      setStatus('error');
      setError('Falta conectar tu cuenta de Google para leer el calendario.');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setError(null);
    (async () => {
      try {
        const timeMin = buildSafeIsoDateTime(getLocalDateString(), '00:00');
        const events = await listUpcomingCalendarEvents(accessToken, { timeMin, maxResults: FETCH_LIMIT });
        if (cancelled) return;
        const result = buildImportCandidates(events, existingActivities, count);
        setDrafts(result.drafts);
        setSkipped(result.skipped);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof WorkspaceAuthError) {
          onAuthError();
          return;
        }
        setError(getErrorMessage(err, 'No se pudo leer el calendario de Google.'));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, accessToken, count, reloadTick]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const problemsByKey = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const d of drafts) map.set(d.calendarEventId, validateDraft(d));
    return map;
  }, [drafts]);
  const incompleteCount = useMemo(
    () => drafts.filter((d) => (problemsByKey.get(d.calendarEventId) ?? []).length > 0).length,
    [drafts, problemsByKey]
  );

  if (!isOpen) return null;

  const updateDraft = (key: string, patch: Partial<CalendarImportDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.calendarEventId === key ? { ...d, ...patch } : d)));
  };
  const removeDraft = (key: string) => {
    setDrafts((prev) => prev.filter((d) => d.calendarEventId !== key));
  };

  const canImport = status === 'ready' && drafts.length > 0 && incompleteCount === 0;
  const handleImport = () => {
    if (!canImport) return;
    onImport(drafts.map(draftToActivity));
    onClose();
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="calendar-import-title"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden sm:overflow-y-auto overscroll-none"
    >
      <div
        data-bottom-sheet="true"
        style={sheetStyle}
        className="w-full sm:max-w-3xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain h-[88dvh] sm:h-auto sm:max-h-[90vh] flex flex-col animate-in fade-in sm:zoom-in-95 duration-200"
      >
        <BottomSheetHandle {...dragBind} isExpanded={isExpanded} isDragging={isDragging} />

        <div
          {...dragBind}
          className="p-4 sm:p-6 pb-3 sm:pb-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 select-none touch-none sm:touch-auto cursor-grab active:cursor-grabbing sm:cursor-default"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <CalendarDays className="w-5 h-5 text-[#001428] shrink-0" />
            <div className="min-w-0">
              <h3 id="calendar-import-title" className="text-sm sm:text-base font-bold text-[#001428] tracking-tight truncate">
                Importar desde Google Calendar
              </h3>
              <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                Calendario principal de {accountEmail || 'la cuenta conectada'}
              </p>
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

        <div className="px-4 sm:px-6 py-3 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center gap-3 shrink-0">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <span>Próximas</span>
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value) === 20 ? 20 : 10)}
              disabled={status === 'loading'}
              className="text-xs p-1.5 rounded border border-slate-300 bg-white font-bold cursor-pointer"
            >
              {COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} actividades
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setReloadTick((t) => t + 1)}
            disabled={status === 'loading'}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Volver a leer</span>
          </button>
          <p className="text-[11px] text-slate-500 leading-relaxed flex-1 min-w-[220px]">
            Revisa cada actividad, complétala y quita las que no quieras. Quitar una de esta lista <strong>no la borra</strong> de
            Google Calendar. Se importan como <strong>pendientes</strong>.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {status === 'loading' && (
            <div className="py-10 flex flex-col items-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin text-[#0284c7]" />
              <span>Leyendo tu calendario…</span>
            </div>
          )}

          {status === 'error' && (
            <div role="alert" className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {status === 'ready' && skipped && (skipped.yaEnAgenda > 0 || skipped.cumpleanos > 0 || skipped.otros > 0) && (
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Se omitieron{' '}
              {[
                skipped.yaEnAgenda > 0 ? `${skipped.yaEnAgenda} que ya están en la agenda` : '',
                skipped.cumpleanos > 0 ? `${skipped.cumpleanos} cumpleaños del equipo` : '',
                skipped.otros > 0 ? `${skipped.otros} cancelados o de otro tipo` : '',
              ]
                .filter(Boolean)
                .join(', ')}
              .
            </p>
          )}

          {status === 'ready' && drafts.length === 0 && (
            <div className="py-10 px-4 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50 text-xs text-slate-600">
              No hay actividades nuevas para importar en el calendario de {accountEmail || 'la cuenta conectada'}.
            </div>
          )}

          {status === 'ready' &&
            drafts.map((d) => {
              const problems = problemsByKey.get(d.calendarEventId) ?? [];
              const isVisit = d.type === 'visita';
              return (
                <div key={d.calendarEventId} className="border border-slate-200 rounded-xl p-3 sm:p-4 space-y-3 bg-white shadow-2xs">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className={LABEL_CLASS}>Título *</label>
                        <input
                          type="text"
                          value={d.title}
                          onChange={(e) => updateDraft(d.calendarEventId, { title: e.target.value })}
                          className={INPUT_CLASS}
                        />
                      </div>
                      <div>
                        <label className={LABEL_CLASS}>
                          Tipo {d.typeRecognized ? <span className="font-medium text-emerald-700">(sugerido)</span> : <span className="font-medium text-amber-700">(revísalo)</span>}
                        </label>
                        <select
                          value={d.type}
                          onChange={(e) => updateDraft(d.calendarEventId, { type: e.target.value as ImportActivityType, typeRecognized: true })}
                          className={`${INPUT_CLASS} cursor-pointer`}
                        >
                          {(Object.keys(IMPORT_TYPE_LABELS) as ImportActivityType[]).map((t) => (
                            <option key={t} value={t}>
                              {IMPORT_TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDraft(d.calendarEventId)}
                      title="Quitar de la lista (no se borra de Google Calendar)"
                      aria-label={`Quitar "${d.title || 'actividad sin título'}" de la lista`}
                      className="p-1.5 mt-5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className={LABEL_CLASS}>Fecha *</label>
                      <input type="date" value={d.date} onChange={(e) => updateDraft(d.calendarEventId, { date: e.target.value })} className={INPUT_CLASS} />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Inicio *</label>
                      <input type="time" value={d.startTime} onChange={(e) => updateDraft(d.calendarEventId, { startTime: e.target.value })} className={INPUT_CLASS} />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Fin *</label>
                      <input type="time" value={d.endTime} onChange={(e) => updateDraft(d.calendarEventId, { endTime: e.target.value })} className={INPUT_CLASS} />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className={LABEL_CLASS}>Lugar</label>
                      <input type="text" value={d.location} onChange={(e) => updateDraft(d.calendarEventId, { location: e.target.value })} placeholder="A confirmar" className={INPUT_CLASS} />
                    </div>
                  </div>

                  {isVisit && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className={LABEL_CLASS}>Escuela / institución</label>
                        <input type="text" value={d.institution} onChange={(e) => updateDraft(d.calendarEventId, { institution: e.target.value })} className={INPUT_CLASS} />
                      </div>
                      <div>
                        <label className={LABEL_CLASS}>Alumnos (estimados)</label>
                        <input type="number" min="1" max="250" value={d.attendeesCount} onChange={(e) => updateDraft(d.calendarEventId, { attendeesCount: e.target.value })} placeholder="A confirmar" className={INPUT_CLASS} />
                      </div>
                      <div className="sm:col-span-3">
                        <label className={LABEL_CLASS}>Nivel educativo</label>
                        <input
                          type="text"
                          list="calendar-import-levels"
                          value={d.level}
                          onChange={(e) => updateDraft(d.calendarEventId, { level: e.target.value })}
                          placeholder="Elige uno de la lista o escríbelo"
                          className={INPUT_CLASS}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={LABEL_CLASS}>Email de contacto de la escuela</label>
                        <input type="email" value={d.contactEmail} onChange={(e) => updateDraft(d.calendarEventId, { contactEmail: e.target.value })} className={INPUT_CLASS} />
                      </div>
                      <div>
                        <label className={LABEL_CLASS}>Teléfono de contacto</label>
                        <input type="tel" value={d.contactPhone} onChange={(e) => updateDraft(d.calendarEventId, { contactPhone: e.target.value })} className={INPUT_CLASS} />
                      </div>
                    </div>
                  )}

                  {!isVisit && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className={LABEL_CLASS}>Asistentes (estimados)</label>
                        <input type="number" min="1" value={d.attendeesCount} onChange={(e) => updateDraft(d.calendarEventId, { attendeesCount: e.target.value })} placeholder="A confirmar" className={INPUT_CLASS} />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className={LABEL_CLASS}>Responsable</label>
                    <input type="text" value={d.responsible} onChange={(e) => updateDraft(d.calendarEventId, { responsible: e.target.value })} placeholder="Persona o área a cargo" className={INPUT_CLASS} />
                  </div>

                  <details className="text-xs">
                    <summary className="cursor-pointer font-semibold text-[#0284c7] select-none">Descripción (viene de Calendar)</summary>
                    <textarea
                      value={d.description}
                      onChange={(e) => updateDraft(d.calendarEventId, { description: e.target.value })}
                      rows={3}
                      className={`${INPUT_CLASS} mt-2`}
                    />
                  </details>

                  {(d.notices.length > 0 || problems.length > 0) && (
                    <ul className="space-y-0.5 text-[11px]">
                      {d.notices.map((n) => (
                        <li key={n} className="text-amber-800">• {n}</li>
                      ))}
                      {problems.map((p) => (
                        <li key={p} className="text-rose-700 font-semibold">• {p}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}

          <datalist id="calendar-import-levels">
            {VISIT_LEVEL_OPTIONS.filter((o) => o !== 'Otro (especificar...)').map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </div>

        <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-white flex flex-wrap items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] text-slate-500">
            {status === 'ready' && drafts.length > 0
              ? incompleteCount > 0
                ? `${incompleteCount} de ${drafts.length} con datos por completar`
                : `${drafts.length} ${drafts.length === 1 ? 'actividad lista' : 'actividades listas'} para importar`
              : ''}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-md font-semibold transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={!canImport}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#001428] hover:bg-[#122a45] text-white text-xs font-bold rounded-md shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{drafts.length > 0 ? `Importar ${drafts.length}` : 'Importar'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
