'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Mail, Send, X, AlertCircle, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { sendGmailMessage, WorkspaceAuthError } from '@/lib/workspace';
import { getInstitutionalSettings } from '@/lib/storage';
import { UserProfile } from '@/lib/auth';
import { useBottomSheetDrag } from '@/lib/useBottomSheetDrag';
import { BottomSheetHandle } from '@/components/BottomSheetHandle';

interface GmailComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
  accessToken: string | null;
  currentUser?: UserProfile | null;
  onRequireAuth: () => void;
  /** Se invoca cuando Google rechaza el token (vencido o sin permiso) para que la app lo descarte. */
  onAuthExpired?: () => void;
  onRequireConfirmation: (
    title: string,
    description: string,
    details: { label: string; value: string }[],
    action: () => Promise<void>
  ) => void;
}

export function GmailComposerModal({
  isOpen,
  onClose,
  defaultTo = '',
  defaultSubject = '',
  defaultBody,
  accessToken,
  currentUser,
  onRequireAuth,
  onAuthExpired,
  onRequireConfirmation,
}: GmailComposerModalProps) {
  const senderEmail = currentUser?.email || '';
  const senderName = currentUser?.displayName || 'Usuario Institucional';
  const senderRoleLabel = currentUser?.role === 'administrador' ? 'Administrador' : 'Visitante';

  const [instituteName] = useState(() => getInstitutionalSettings().instituteName);
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(
    defaultBody ||
      `Estimado/a,\n\nNos comunicamos desde el ${instituteName} en relación con las actividades formativas y trámites programados.\n\nQuedamos a su entera disposición.\n\nAtentamente,\n${senderName}${senderEmail ? `\n${senderEmail}` : ''}\n${instituteName}`
  );
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Si el modal se cierra a mano antes de los 2 s, el cierre diferido no debe tocar uno nuevo.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const gmailSheet = useBottomSheetDrag({
    isOpen,
    onClose: () => {
      if (!isSending) onClose();
    },
  });

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSending) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSending, onClose]);

  if (!isOpen) return null;

  const gmailWebComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    to
  )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!to.trim() || !subject.trim() || !body.trim()) {
      setStatusMessage({ type: 'error', text: 'Completa el destinatario, el asunto y el mensaje.' });
      return;
    }

    if (!accessToken) {
      onClose();
      onRequireAuth();
      return;
    }

    onRequireConfirmation(
      '¿Enviar correo institucional mediante Gmail?',
      `Esta acción enviará un correo electrónico oficial desde tu cuenta iniciada (${senderEmail || 'Gmail'}) a ${to}.`,
      [
        { label: 'De (Remitente)', value: senderEmail ? `${senderName} <${senderEmail}>` : 'Cuenta conectada' },
        { label: 'Para (Destinatario)', value: to },
        { label: 'Asunto', value: subject },
      ],
      async () => {
        setIsSending(true);
        setStatusMessage(null);
        try {
          await sendGmailMessage(accessToken, {
            to,
            subject,
            body,
            from: senderEmail,
            senderName,
          });
          setStatusMessage({
            type: 'success',
            text: `¡Correo enviado correctamente desde ${senderEmail || 'tu cuenta de Gmail'}!`,
          });
          closeTimerRef.current = setTimeout(() => {
            onClose();
          }, 2000);
        } catch (err: any) {
          if (err instanceof WorkspaceAuthError) onAuthExpired?.();
          setStatusMessage({
            type: 'error',
            text: err?.message || 'Error al enviar el correo mediante Gmail',
          });
        } finally {
          setIsSending(false);
        }
      }
    );
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSending) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gmail-modal-title"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden sm:overflow-y-auto overscroll-none"
    >
      <div
        data-bottom-sheet="true"
        style={gmailSheet.sheetStyle}
        className="w-full sm:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain h-[88dvh] sm:h-auto sm:max-h-[90vh] flex flex-col animate-in fade-in sm:zoom-in-95 duration-200"
      >
        <BottomSheetHandle
          {...gmailSheet.dragBind}
          isExpanded={gmailSheet.isExpanded}
          isDragging={gmailSheet.isDragging}
        />
        <div
          {...gmailSheet.dragBind}
          className="p-4 sm:p-6 pb-3 sm:pb-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 select-none touch-none sm:touch-auto cursor-grab active:cursor-grabbing sm:cursor-default"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Mail className="w-5 h-5 text-[#001428] shrink-0" />
            <div className="min-w-0">
              <h3 id="gmail-modal-title" className="text-sm sm:text-base font-bold text-[#001428] tracking-tight truncate">Redactar Correo con Gmail</h3>
              <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                Envío oficial desde la cuenta iniciada del usuario
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

        <form onSubmit={handleSubmit} className="p-3.5 sm:p-5 space-y-3.5 overflow-y-auto flex-1 text-xs text-slate-800">
          {/* Remitente con sesión iniciada */}
          <div>
            <label className="block text-xs font-bold text-[#001428] mb-1">
              De (Remitente con sesión iniciada)
            </label>
            <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <div className="w-7 h-7 rounded-full bg-[#001428] text-white flex items-center justify-center font-bold text-xs shrink-0">
                {(senderName || senderEmail || 'U')[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#001428] truncate">
                  {senderName}
                </p>
                <p className="text-[11px] text-slate-500 font-mono truncate">
                  {senderEmail || 'Sin correo identificado'}
                </p>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-[#0284c7] border border-blue-200 uppercase tracking-wider shrink-0">
                {senderRoleLabel}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              El correo se despacha con la identidad del usuario que tiene la sesión activa.
            </p>
          </div>

          <div>
            <label htmlFor="gmail-to" className="block text-xs font-bold text-[#001428] mb-1">Para (Correo electrónico) *</label>
            <input
              id="gmail-to"
              type="email"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="destinatario@ejemplo.com"
              className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="gmail-subject" className="block text-xs font-bold text-[#001428] mb-1">Asunto *</label>
            <input
              id="gmail-subject"
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Confirmación de visita / Material pedagógico"
              className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="gmail-body" className="block text-xs font-bold text-[#001428] mb-1">Mensaje *</label>
            <textarea
              id="gmail-body"
              rows={6}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none font-sans leading-relaxed"
            />
          </div>

          {statusMessage && (
            <div
              className={`p-3 rounded flex items-center gap-2 text-xs ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 flex flex-col-reverse sm:flex-row justify-between items-center gap-2 shrink-0">
            <a
              href={gmailWebComposeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              title="Abrir directamente en la web de Gmail con tu navegador"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              <span>Abrir en Gmail Web</span>
            </a>

            <div className="w-full sm:w-auto flex flex-col-reverse sm:flex-row items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto text-center px-4 py-2.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSending}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#001428] hover:bg-[#122a45] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Enviar por Gmail</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

