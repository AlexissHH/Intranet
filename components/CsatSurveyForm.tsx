'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, GraduationCap, Loader2, Send, TriangleAlert, XCircle } from 'lucide-react';
import { CSAT_COMMENT_MAX_CHARS, isCsatTokenFormatValid, saveCsatSurvey } from '@/lib/visit-csat';

interface CsatSurveyFormProps {
  /** Token de la encuesta (segmento de ruta): identifica UNA visita. */
  token: string;
}

/**
 * Formulario PÚBLICO de calificación de la visita (1 a 5 estrellas + comentario).
 * No requiere sesión: la creación del documento en Firestore la autoriza
 * firestore.rules para este tipo de documento anónimo (una sola vez).
 */
export function CsatSurveyForm({ token }: CsatSurveyFormProps) {
  const [activityTitle, setActivityTitle] = useState('');
  const [activityDate, setActivityDate] = useState('');
  const [activityId, setActivityId] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      const search = new URLSearchParams(window.location.search);
      setActivityTitle(search.get('a') ?? '');
      setActivityDate(search.get('d') ?? '');
      setActivityId(search.get('ai') ?? '');
    } catch {
      // Ignore
    }
  }, []);

  const isValidToken = isCsatTokenFormatValid(token);
  const ratedForDisplay = rating ?? 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || done) return;
    if (!isValidToken) {
      setErrorMsg('El enlace de la encuesta no es válido. Pedí a la institución un enlace actualizado.');
      return;
    }
    if (!rating || rating < 1 || rating > 5) {
      setErrorMsg('Seleccioná una calificación de 1 a 5 estrellas.');
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const result = await saveCsatSurvey({
        id: token,
        activityId,
        rating: rating ?? 0,
        comment: comment.trim().slice(0, CSAT_COMMENT_MAX_CHARS),
        submittedAt: new Date().toISOString(),
      });
      if (result === 'ok') {
        setDone(true);
      } else if (result === 'already') {
        setDone(true);
        setErrorMsg('Esta encuesta ya había sido respondida.');
      } else if (result === 'denied') {
        // Rechazado por reglas (token inválido/expirado o actividad sin encuesta activa).
        setErrorMsg('Este enlace no corresponde a una encuesta vigente. Solicitá un enlace actualizado a la institución.');
      } else {
        setErrorMsg('No se pudo enviar tu respuesta. Revisá tu conexión e intentá de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-dvh bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 max-w-md w-full text-center space-y-4">
          <CheckCircle2 className="w-14 h-14 text-emerald-600 mx-auto" />
          <h1 className="text-xl font-extrabold text-[#001428]">¡Gracias por tu respuesta!</h1>
          <p className="text-sm text-slate-600">
            {errorMsg
              ? // Caso 'already': la respuesta anterior se conservó íntegra.
                errorMsg
              : 'Tu calificación ayuda al Instituto de Capacitación Legislativa a mejorar las visitas guiadas.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-100 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6 sm:p-8 max-w-md w-full space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#001428] flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5 text-sky-300" />
          </div>
          <div>
            <p className="text-[10px] font-extrabold tracking-wider text-slate-500 uppercase">
              Instituto de Capacitación Legislativa
            </p>
            <h1 className="text-lg font-extrabold text-[#001428] leading-tight">
              Encuesta de satisfacción
            </h1>
          </div>
        </div>

        {(activityTitle || activityDate) && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-0.5">
            {activityTitle && <p className="text-sm font-bold text-[#001428] break-words">{activityTitle}</p>}
            {activityDate && <p className="text-[11px] text-slate-500">Fecha: {activityDate}</p>}
          </div>
        )}

        {!isValidToken ? (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg space-y-2">
            <p className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
              <TriangleAlert className="w-4 h-4" />
              Enlace inválido
            </p>
            <p className="text-xs text-rose-700">
              Este enlace de encuesta no es válido. Contactá al Instituto para recibir el enlace correcto.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-[#001428] mb-2">
                ¿Qué tan satisfecho estás con la visita?
              </label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => {
                      setRating(star);
                      setErrorMsg(null);
                    }}
                    aria-label={`${star} de 5`}
                    className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7] rounded p-0.5 cursor-pointer transition-transform hover:scale-110"
                  >
                    <span className={star <= ratedForDisplay ? 'text-amber-400' : 'text-slate-300'}>
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                1 = Muy insatisfecho · 5 = Muy satisfecho
              </p>
            </div>

            <div>
              <label htmlFor="csat-comment" className="block text-xs font-bold text-[#001428] mb-1">
                Comentarios (opcional)
              </label>
              <textarea
                id="csat-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, CSAT_COMMENT_MAX_CHARS))}
                rows={4}
                placeholder="¿Qué mejorarías de la visita? ¿Observaciones del recorrido, guías u horarios?"
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none resize-none"
              />
              <p className="text-[10px] text-slate-400 text-right mt-0.5">
                {comment.length}/{CSAT_COMMENT_MAX_CHARS}
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-1.5">
                <XCircle className="w-4 h-4 shrink-0 text-rose-600 mt-px" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !rating}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#001428] hover:bg-[#12294a] disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-extrabold transition-colors cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Enviando…</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 text-sky-400" />
                  <span>Enviar calificación</span>
                </>
              )}
            </button>
          </form>
        )}

        <p className="text-[9px] text-slate-400 text-center leading-relaxed">
          Estas respuestas son anónimas y solo se usan para evaluar el servicio pedagógico ante recursos oficials.
        </p>
      </div>
    </div>
  );
}
