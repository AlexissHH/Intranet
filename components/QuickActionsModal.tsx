'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  GraduationCap,
  Calendar,
  FileText,
  Building,
  CheckCircle2,
  ImageIcon,
  Upload,
  Trash2,
  Check,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { ActivityItem, NewsItem } from '@/lib/mock-data';
import {
  getLocalDateString,
  compressImageFile,
  isWeekendDay,
  getWeekendDayName,
  getNextBusinessDayString,
  INSTITUTIONAL_TIMEZONE,
} from '@/lib/utils';
import { useBottomSheetDrag } from '@/lib/useBottomSheetDrag';
import { BottomSheetHandle } from '@/components/BottomSheetHandle';

interface QuickActionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveActivity: (activity: ActivityItem, syncCalendar: boolean) => Promise<void> | void;
  onSaveNews: (news: NewsItem) => void;
  hasCalendarAuth: boolean;
  initialAction?: 'visita' | 'actividad' | 'novedad';
  initialDate?: string;
}

/** Cantidad de asistentes: vacío o inválido = sin dato (nunca se inventa una cifra). */
function parseAttendees(value: string): number | undefined {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Solo se aceptan imágenes locales (data:image, ruta del sitio) o https. */
function isAcceptableImageSrc(value: string): boolean {
  const v = value.trim();
  return v === '' || /^data:image\//i.test(v) || /^https:\/\//i.test(v) || /^\/[^/]/.test(v);
}

function CalendarSyncToggle({
  checked,
  onToggle,
  hasCalendarAuth,
}: {
  checked: boolean;
  onToggle: () => void;
  hasCalendarAuth: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className={`w-full text-left p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-all select-none ${
        checked
          ? 'bg-sky-50/90 border-[#0284c7] shadow-xs'
          : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80 hover:border-slate-300'
      }`}
    >
      <span className="flex items-center gap-2.5">
        <span
          className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
            checked ? 'bg-[#0284c7] text-white shadow-xs' : 'bg-slate-200 text-slate-500'
          }`}
        >
          <Calendar className="w-4 h-4" />
        </span>
        <span>
          <span className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#001428]">Sincronizar en Google Calendar</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold flex items-center gap-0.5 tracking-tight ${
                checked ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {checked ? (
                <>
                  <Check className="w-3 h-3 text-emerald-700" />
                  <span>ACTIVADO</span>
                </>
              ) : (
                <span>DESACTIVADO</span>
              )}
            </span>
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {!checked
              ? 'Haz clic para agendarla también en tu Google Calendar.'
              : hasCalendarAuth
              ? 'Se agendará en tu Google Calendar al confirmar.'
              : 'Aún no conectaste Google: se guardará igual en el cronograma y se te pedirá conectar tu cuenta.'}
          </span>
        </span>
      </span>
      <span
        className={`pointer-events-none relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
          checked ? 'bg-[#0284c7]' : 'bg-slate-300'
        }`}
        aria-hidden="true"
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
}

export function QuickActionsModal({
  isOpen,
  onClose,
  onSaveActivity,
  onSaveNews,
  hasCalendarAuth,
  initialAction = 'visita',
  initialDate,
}: QuickActionsModalProps) {
  const [activeTab, setActiveTab] = useState<'visita' | 'actividad' | 'novedad'>(initialAction);
  const { isExpanded, isDragging, dragBind, sheetStyle } = useBottomSheetDrag({ isOpen, onClose });

  const [visitSchool, setVisitSchool] = useState('');
  const [visitLevel, setVisitLevel] = useState('Secundario (4to año)');
  const [visitAttendees, setVisitAttendees] = useState<string>('');
  const [visitDate, setVisitDate] = useState(() => initialDate || getNextBusinessDayString());
  const [visitStartTime, setVisitStartTime] = useState('10:00');
  const [visitEndTime, setVisitEndTime] = useState('11:45');
  const [visitResponsible, setVisitResponsible] = useState('');
  const [visitLocation, setVisitLocation] = useState('Recinto de Sesiones y Salón de Pasos Perdidos');
const [visitContactEmail, setVisitContactEmail] = useState('');
  const [visitNotes, setVisitNotes] = useState('');
  const [syncWithGoogleCalendar, setSyncWithGoogleCalendar] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const visitTimeInvalid = !!visitStartTime && !!visitEndTime && visitEndTime <= visitStartTime;
  const isVisitWeekend = isWeekendDay(visitDate);
  const visitWeekendName = getWeekendDayName(visitDate);
  const nextBusinessDayForVisit = getNextBusinessDayString(visitDate);

  const [actTitle, setActTitle] = useState('');
  const [actType, setActType] = useState<'capacitacion' | 'evento' | 'reunion'>('capacitacion');
  const [actDate, setActDate] = useState(() => initialDate || getLocalDateString());
  const [actStartTime, setActStartTime] = useState('14:30');
  const [actEndTime, setActEndTime] = useState('16:30');
  const [actLocation, setActLocation] = useState('Aula Magna del Instituto - Piso 2');
  const [actResponsible, setActResponsible] = useState('');
  const [actAttendees, setActAttendees] = useState<string>('');
  const actTimeInvalid = !!actStartTime && !!actEndTime && actEndTime <= actStartTime;
  const [actDescription, setActDescription] = useState('');

  const [newsTitle, setNewsTitle] = useState('');
  const [newsCategory, setNewsCategory] = useState<'Institucional' | 'Urgente' | 'Capacitación' | 'Programas' | 'Novedad'>('Institucional');
  const [newsSummary, setNewsSummary] = useState('');
  const [newsContent, setNewsContent] = useState('');
  const [newsAuthor, setNewsAuthor] = useState('Secretaría del Instituto');
  const [newsPinned, setNewsPinned] = useState(false);
  const [newsIsAnnouncement, setNewsIsAnnouncement] = useState(false);
  const [newsImageUrl, setNewsImageUrl] = useState('');
  const [isCompressingImage, setIsCompressingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const newsFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError(null);
    if (!file.type.startsWith('image/')) {
      setImageError('El archivo elegido no es una imagen.');
      e.target.value = '';
      return;
    }
    try {
      setIsCompressingImage(true);
      const optimized = await compressImageFile(file);
      if (optimized && /^data:image\//i.test(optimized)) {
        setNewsImageUrl(optimized);
      } else {
        setImageError('No se pudo procesar la imagen. Prueba con otro archivo (JPG o PNG).');
      }
    } catch {
      setImageError('No se pudo procesar la imagen. Prueba con otro archivo (JPG o PNG).');
    } finally {
      setIsCompressingImage(false);
    }
  };

  const handleRemoveImage = () => {
    setNewsImageUrl('');
    setImageError(null);
    if (newsFileInputRef.current) {
      newsFileInputRef.current.value = '';
    }
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

  const handleCreateVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitSchool.trim() || isSubmitting) return;

    if (isWeekendDay(visitDate) || visitTimeInvalid) {
      return;
    }

    try {
      setIsSubmitting(true);
      const visitCount = parseAttendees(visitAttendees);
      const newVisit: ActivityItem = {
        id: 'visita-' + Date.now(),
        title: `Visita Escolar: ${visitSchool} (${visitLevel})`,
        type: 'visita',
        date: visitDate,
        startTime: visitStartTime,
        endTime: visitEndTime,
        location: visitLocation,
        responsible: visitResponsible.trim() || 'Coordinación del Instituto',
        // Sin dato = sin cifra: antes se registraban 30 alumnos inventados.
        attendeesCount: visitCount,
        institution: visitSchool,
        level: visitLevel,
        // Email de contacto de la institución: destinatario de la encuesta de satisfacción.
        contactEmail: visitContactEmail.trim() || undefined,
        description: `Visita guiada institucional del programa "Conociendo el Poder Legislativo".${
          visitCount ? ` Contingente de ${visitCount} participantes.` : ''
        }`,
        status: 'pendiente',
        notes: visitNotes.trim() || undefined,
      };

      await onSaveActivity(newVisit, syncWithGoogleCalendar);
      onClose();
      setVisitSchool('');
      setVisitNotes('');
      setVisitContactEmail('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actTitle.trim() || isSubmitting || actTimeInvalid) return;

    try {
      setIsSubmitting(true);
      const newAct: ActivityItem = {
        id: 'act-' + Date.now(),
        title: actTitle,
        type: actType,
        date: actDate,
        startTime: actStartTime,
        endTime: actEndTime,
        location: actLocation,
        responsible: actResponsible.trim() || 'Coordinación del Instituto',
        attendeesCount: parseAttendees(actAttendees),
        description: actDescription || 'Actividad programada por el Instituto de Capacitación Legislativa.',
        status: 'confirmada',
      };

      await onSaveActivity(newAct, syncWithGoogleCalendar);
      onClose();
      setActTitle('');
      setActDescription('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateNews = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsTitle.trim() || !newsSummary.trim()) return;
    if (!isAcceptableImageSrc(newsImageUrl)) {
      setImageError('La imagen debe ser una URL https:// o un archivo subido desde tu equipo.');
      return;
    }

    const todayStr = new Date().toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: INSTITUTIONAL_TIMEZONE,
    });

    const newNewsItem: NewsItem = {
      id: 'news-' + Date.now(),
      title: newsTitle,
      date: todayStr,
      category: newsCategory,
      summary: newsSummary,
      content: newsContent || newsSummary,
      author: newsAuthor,
      pinned: newsPinned,
      isAnnouncement: newsIsAnnouncement,
      imageUrl: newsImageUrl.trim() ? newsImageUrl.trim() : undefined,
    };

    onSaveNews(newNewsItem);
    onClose();
    setNewsTitle('');
    setNewsSummary('');
    setNewsContent('');
    setNewsPinned(false);
    setNewsIsAnnouncement(false);
    handleRemoveImage();
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-actions-title"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden sm:overflow-y-auto overscroll-none"
    >
      <div
        data-bottom-sheet="true"
        style={sheetStyle}
        className="w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain h-[88dvh] sm:h-auto sm:max-h-[90vh] flex flex-col animate-in fade-in sm:zoom-in-95 duration-200"
      >
        <BottomSheetHandle
          {...dragBind}
          isExpanded={isExpanded}
          isDragging={isDragging}
        />

        <div
          {...dragBind}
          className="p-4 sm:p-6 pb-3 sm:pb-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 select-none touch-none sm:touch-auto cursor-grab active:cursor-grabbing sm:cursor-default"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Building className="w-5 h-5 text-[#001428] shrink-0" />
            <div className="min-w-0">
              <h3 id="quick-actions-title" className="text-sm sm:text-base font-bold text-[#001428] tracking-tight truncate">Carga Rápida de Trámites y Actividades</h3>
              <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">Gestión de visitas ciudadanas, cursos y comunicados</p>
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

        <div className="grid grid-cols-3 sm:flex border-b border-slate-200 bg-slate-50/80 px-1.5 sm:px-4 pt-1.5 sm:pt-2 gap-1 sm:gap-2 text-xs font-semibold overflow-x-auto no-scrollbar shrink-0 touch-manipulation">
          <button
            type="button"
            onClick={() => setActiveTab('visita')}
            className={`flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap text-center sm:text-left ${
              activeTab === 'visita'
                ? 'border-[#0284c7] text-[#001428] font-bold bg-white rounded-t shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5 text-[#0284c7] shrink-0" />
            <span className="truncate">
              <span className="hidden sm:inline">Nueva </span>Visita<span className="hidden sm:inline"> Escolar</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('actividad')}
            className={`flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap text-center sm:text-left ${
              activeTab === 'actividad'
                ? 'border-[#0284c7] text-[#001428] font-bold bg-white rounded-t shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">
              <span className="hidden sm:inline">Registrar </span>Actividad<span className="hidden lg:inline"> / Curso</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('novedad')}
            className={`flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap text-center sm:text-left ${
              activeTab === 'novedad'
                ? 'border-[#0284c7] text-[#001428] font-bold bg-white rounded-t shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-purple-600 shrink-0" />
            <span className="truncate">
              <span className="hidden sm:inline">Publicar </span>Novedad<span className="hidden sm:inline"> Portada</span>
            </span>
          </button>
        </div>

        <div className="p-3.5 sm:p-5 overflow-y-auto flex-1 text-xs text-slate-800">
          {activeTab === 'visita' && (
            <form onSubmit={handleCreateVisit} className="space-y-4">
              <div className="bg-[#eff6ff] p-3 rounded-lg border border-[#bfdbfe] flex items-center justify-between text-xs text-[#0284c7]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#0284c7] shrink-0" />
                  <span>Programa oficial: <strong>&quot;Conociendo el Poder Legislativo&quot;</strong></span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-white px-2 py-0.5 rounded border border-[#bfdbfe]">
                  Acreditación
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="qa-field-1" className="block text-xs font-bold text-[#001428] mb-1">
                    Institución Educativa / Escuela *
                  </label>
                  <input id="qa-field-1"
                    type="text"
                    required
                    value={visitSchool}
                    onChange={(e) => setVisitSchool(e.target.value)}
                    placeholder="Ej: Colegio Nacional N° 1 Domingo F. Sarmiento"
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="qa-field-2" className="block text-xs font-bold text-[#001428] mb-1">
                    Nivel Educativo / Curso
                  </label>
                  <select id="qa-field-2"
                    value={visitLevel}
                    onChange={(e) => setVisitLevel(e.target.value)}
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none bg-white"
                  >
                    <option value="Primario (5to y 6to grado)">Primario (5to y 6to grado)</option>
                    <option value="Secundario (Ciclo Básico)">Secundario (Ciclo Básico)</option>
                    <option value="Secundario (4to y 5to año)">Secundario (4to y 5to año)</option>
                    <option value="Terciario / Universitario">Terciario / Universitario</option>
                    <option value="Educación Especial">Educación Especial</option>
                    <option value="Comunidad / Tercera Edad">Comunidad / Tercera Edad</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="qa-field-3" className="block text-xs font-bold text-[#001428] mb-1">
                    Cantidad de Alumnos / Docentes
                  </label>
                  <input id="qa-field-3"
                    type="number"
                    min="5"
                    max="120"
                    value={visitAttendees}
                    onChange={(e) => setVisitAttendees(e.target.value)}
                    placeholder="A confirmar"
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-[#001428]">Fecha programada *</label>
                    <span className="text-[10px] font-semibold text-slate-500">Lunes a Viernes (días hábiles)</span>
                  </div>
                  <input
                    type="date"
                    required
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                    className={`w-full text-xs p-2 rounded border focus:ring-1 focus:outline-none transition-colors ${
                      isVisitWeekend
                        ? 'border-rose-400 bg-rose-50/50 text-rose-950 focus:ring-rose-500'
                        : 'border-slate-300 focus:ring-[#0284c7]'
                    }`}
                  />
                  {isVisitWeekend && (
                    <div className="mt-2 p-3 bg-rose-50 border border-rose-300 rounded-lg text-rose-900 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-extrabold text-[11px] uppercase tracking-wide text-rose-800 bg-rose-100 px-2 py-0.5 rounded border border-rose-300">
                            Día No Laboral • {visitWeekendName}
                          </span>
                          <span className="text-[10px] font-bold text-rose-600">Restricción de Visitas</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-rose-800">
                          La Honorable Legislatura no realiza visitas guiadas los fines de semana. Las visitas escolares deben agendarse exclusivamente en días hábiles (<strong>Lunes a Viernes</strong>).
                        </p>
                        <button
                          type="button"
                          onClick={() => setVisitDate(nextBusinessDayForVisit)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded shadow-2xs transition-colors cursor-pointer"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Cambiar al próximo día hábil ({nextBusinessDayForVisit})</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="qa-field-4" className="block text-xs font-bold text-[#001428] mb-1">Hora Inicio</label>
                    <input id="qa-field-4"
                      type="time"
                      value={visitStartTime}
                      onChange={(e) => setVisitStartTime(e.target.value)}
                      className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="qa-field-5" className="block text-xs font-bold text-[#001428] mb-1">Hora Fin</label>
                    <input id="qa-field-5"
                      type="time"
                      value={visitEndTime}
                      onChange={(e) => setVisitEndTime(e.target.value)}
                      className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                    />
                  </div>
                  {visitTimeInvalid && (
                    <p role="alert" className="col-span-2 text-[11px] font-semibold text-rose-700">
                      La hora de fin debe ser posterior a la de inicio.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="qa-field-6" className="block text-xs font-bold text-[#001428] mb-1">Guía / Responsable</label>
                  <input id="qa-field-6"
                    type="text"
                    value={visitResponsible}
                    onChange={(e) => setVisitResponsible(e.target.value)}
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="qa-field-7" className="block text-xs font-bold text-[#001428] mb-1">Sede / Ubicación</label>
                  <input id="qa-field-7"
                    type="text"
                    value={visitLocation}
                    onChange={(e) => setVisitLocation(e.target.value)}
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="qa-field-8" className="block text-xs font-bold text-[#001428] mb-1">Notas logísticas / Docente a cargo</label>
                  <textarea id="qa-field-8"
                    rows={2}
                    value={visitNotes}
                    onChange={(e) => setVisitNotes(e.target.value)}
                    placeholder="Ej: Docente Prof. Claudia Benítez (Tel: 11-4022-xxxx). Requiere rampa accesible en explanada."
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="qa-field-9" className="block text-xs font-bold text-[#001428] mb-1">
                    Email de contacto de la institución <span className="text-slate-400 font-normal">(para la encuesta de satisfacción)</span>
                  </label>
                  <input id="qa-field-9"
                    type="email"
                    value={visitContactEmail}
                    onChange={(e) => setVisitContactEmail(e.target.value)}
                    placeholder="Ej: direccion@colegio.edu.ar"
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                </div>
              </div>

              <CalendarSyncToggle
                checked={syncWithGoogleCalendar}
                onToggle={() => setSyncWithGoogleCalendar((prev) => !prev)}
                hasCalendarAuth={hasCalendarAuth}
              />

              <div className="pt-3 border-t border-slate-200 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto text-center px-4 py-2.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isVisitWeekend || visitTimeInvalid}
                  className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold transition-colors shadow-xs ${
                    isVisitWeekend
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed border border-slate-300'
                      : 'bg-[#001428] hover:bg-[#122a45] text-white cursor-pointer disabled:opacity-60'
                  }`}
                >
                  {isVisitWeekend ? (
                    <span className="inline-flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Día no laboral (Seleccione Lunes a Viernes)</span>
                    </span>
                  ) : isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{syncWithGoogleCalendar ? 'Agendando en Calendar...' : 'Registrando...'}</span>
                    </>
                  ) : (
                    <span>Registrar Solicitud (Estado: Pendiente)</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'actividad' && (
            <form onSubmit={handleCreateActivity} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="qa-field-9" className="block text-xs font-bold text-[#001428] mb-1">Título de la actividad *</label>
                  <input id="qa-field-9"
                    type="text"
                    required
                    value={actTitle}
                    onChange={(e) => setActTitle(e.target.value)}
                    placeholder="Ej: Taller de Redacción de Dictámenes de Comisión"
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="qa-field-10" className="block text-xs font-bold text-[#001428] mb-1">Tipo de Actividad</label>
                  <select id="qa-field-10"
                    value={actType}
                    onChange={(e) => setActType(e.target.value as any)}
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none bg-white"
                  >
                    <option value="capacitacion">Capacitación / Taller</option>
                    <option value="evento">Evento / Acto Institucional</option>
                    <option value="reunion">Reunión de Coordinación / Equipo</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-[#001428]">Fecha *</label>
                    {isWeekendDay(actDate) && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200">
                        {getWeekendDayName(actDate)} • Fin de semana
                      </span>
                    )}
                  </div>
                  <input
                    type="date"
                    required
                    value={actDate}
                    onChange={(e) => setActDate(e.target.value)}
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                  {isWeekendDay(actDate) && (
                    <p className="mt-1 text-[11px] text-amber-800 flex items-center gap-1 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Aviso: Fecha en día no laboral ({getWeekendDayName(actDate)}). Requiere coordinación de guardia especial.</span>
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="qa-field-11" className="block text-xs font-bold text-[#001428] mb-1">Hora Inicio</label>
                  <input id="qa-field-11"
                    type="time"
                    value={actStartTime}
                    onChange={(e) => setActStartTime(e.target.value)}
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="qa-field-12" className="block text-xs font-bold text-[#001428] mb-1">Hora Fin</label>
                  <input id="qa-field-12"
                    type="time"
                    value={actEndTime}
                    onChange={(e) => setActEndTime(e.target.value)}
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                  {actTimeInvalid && (
                    <p role="alert" className="mt-1 text-[11px] font-semibold text-rose-700">
                      La hora de fin debe ser posterior a la de inicio.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="qa-field-13" className="block text-xs font-bold text-[#001428] mb-1">Ubicación / Modalidad</label>
                  <input id="qa-field-13"
                    type="text"
                    value={actLocation}
                    onChange={(e) => setActLocation(e.target.value)}
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="qa-field-14" className="block text-xs font-bold text-[#001428] mb-1">Responsable / Docente</label>
                  <input id="qa-field-14"
                    type="text"
                    value={actResponsible}
                    onChange={(e) => setActResponsible(e.target.value)}
                    placeholder="Ej: Dr. Fernando Soria"
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="qa-field-15" className="block text-xs font-bold text-[#001428] mb-1">Cantidad de asistentes (opcional)</label>
                  <input id="qa-field-15"
                    type="number"
                    min="1"
                    value={actAttendees}
                    onChange={(e) => setActAttendees(e.target.value)}
                    placeholder="A confirmar"
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="qa-field-16" className="block text-xs font-bold text-[#001428] mb-1">Descripción / Objetivos</label>
                  <textarea id="qa-field-16"
                    rows={2}
                    value={actDescription}
                    onChange={(e) => setActDescription(e.target.value)}
                    placeholder="Breve detalle pedagógico o protocolar..."
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                </div>
              </div>

              <CalendarSyncToggle
                checked={syncWithGoogleCalendar}
                onToggle={() => setSyncWithGoogleCalendar((prev) => !prev)}
                hasCalendarAuth={hasCalendarAuth}
              />

              <div className="pt-3 border-t border-slate-200 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto text-center px-4 py-2.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || actTimeInvalid}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#001428] hover:bg-[#122a45] text-white rounded-lg text-xs font-bold cursor-pointer disabled:opacity-60 transition-colors shadow-xs"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{syncWithGoogleCalendar ? 'Agendando en Calendar...' : 'Registrando...'}</span>
                    </>
                  ) : (
                    <span>Registrar en Cronograma</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'novedad' && (
            <form onSubmit={handleCreateNews} className="space-y-4">
              <div>
                <label htmlFor="qa-field-17" className="block text-xs font-bold text-[#001428] mb-1">Título de la Noticia / Comunicado *</label>
                <input id="qa-field-17"
                  type="text"
                  required
                  value={newsTitle}
                  onChange={(e) => setNewsTitle(e.target.value)}
                  placeholder="Ej: Nuevo cronograma de visitas cívicas para el ciclo lectivo"
                  className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="qa-field-18" className="block text-xs font-bold text-[#001428] mb-1">Categoría</label>
                  <select id="qa-field-18"
                    value={newsCategory}
                    onChange={(e) => setNewsCategory(e.target.value as any)}
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none bg-white"
                  >
                    <option value="Institucional">Institucional</option>
                    <option value="Urgente">Aviso Urgente</option>
                    <option value="Capacitación">Capacitación y Cursos</option>
                    <option value="Programas">Programas Especiales</option>
                    <option value="Novedad">Novedad General</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="qa-field-19" className="block text-xs font-bold text-[#001428] mb-1">Área Emisora / Autor</label>
                  <input id="qa-field-19"
                    type="text"
                    value={newsAuthor}
                    onChange={(e) => setNewsAuthor(e.target.value)}
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="qa-field-20" className="block text-xs font-bold text-[#001428] mb-1">Resumen breve (Portada) *</label>
                <textarea id="qa-field-20"
                  rows={2}
                  required
                  value={newsSummary}
                  onChange={(e) => setNewsSummary(e.target.value)}
                  placeholder="Síntesis que se mostrará en el feed principal..."
                  className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="qa-field-21" className="block text-xs font-bold text-[#001428] mb-1">Contenido extendido</label>
                <textarea id="qa-field-21"
                  rows={4}
                  value={newsContent}
                  onChange={(e) => setNewsContent(e.target.value)}
                  placeholder="Texto completo del comunicado o resolución..."
                  className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none leading-relaxed"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#001428] flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-[#0284c7]" />
                    <span>Imagen de la Noticia (Opcional)</span>
                  </label>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {isCompressingImage ? 'Procesando foto...' : newsImageUrl ? 'Foto adjuntada' : 'Sin foto adjunta'}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <label className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded cursor-pointer transition-colors shrink-0 ${isCompressingImage ? 'opacity-60 pointer-events-none' : ''}`}>
                    <Upload className="w-3.5 h-3.5 text-[#0284c7]" />
                    <span>{isCompressingImage ? 'Optimizando foto...' : 'Subir imagen desde equipo'}</span>
                    <input
                      ref={newsFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={isCompressingImage}
                      onChange={handleImageFileChange}
                    />
                  </label>

                  <div className="flex-1 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newsImageUrl}
                      onChange={(e) => setNewsImageUrl(e.target.value)}
                      placeholder="o pega URL de la imagen (https://...)"
                      className="w-full text-xs p-1.5 bg-white rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-0.5 text-[11px] text-slate-500">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Ejemplo:</span>
                  <button
                    type="button"
                    onClick={() => setNewsImageUrl('/legislative_seminar.jpg')}
                    className="px-2 py-0.5 bg-slate-200/80 hover:bg-slate-300 rounded text-slate-700 font-medium transition-colors cursor-pointer"
                  >
                    Foto Recinto / Sesión
                  </button>
                </div>

                {imageError && (
                  <p role="alert" className="text-[11px] font-semibold text-rose-700">
                    {imageError}
                  </p>
                )}

                {newsImageUrl && (
                  <div className="relative mt-2 p-2 bg-white rounded border border-slate-200 flex items-center justify-between gap-3 animate-in fade-in">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-16 h-12 bg-slate-100 rounded overflow-hidden shrink-0 border border-slate-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={newsImageUrl}
                          alt="Vista previa"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = '/legislative_seminar.jpg';
                          }}
                        />
                      </div>
                      <div className="overflow-hidden">
                        <div className="text-xs font-bold text-[#001428] truncate">
                          Vista previa de la imagen
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-xs">
                          {newsImageUrl.startsWith('data:') ? 'Imagen local optimizada' : newsImageUrl}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="text-slate-400 hover:text-rose-600 p-1.5 rounded hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                      title="Quitar imagen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="qa-news-pinned"
                    checked={newsPinned}
                    onChange={(e) => setNewsPinned(e.target.checked)}
                    className="w-4 h-4 text-[#0284c7] rounded cursor-pointer"
                  />
                  <label htmlFor="qa-news-pinned" className="text-xs text-slate-700 font-semibold cursor-pointer">
                    Fijar al inicio de la lista de novedades
                  </label>
                </div>

                <div className="flex items-start gap-2 pt-2 border-t border-slate-200/80">
                  <input
                    type="checkbox"
                    id="qa-news-announcement"
                    checked={newsIsAnnouncement}
                    onChange={(e) => setNewsIsAnnouncement(e.target.checked)}
                    className="w-4 h-4 text-[#0284c7] rounded cursor-pointer mt-0.5"
                  />
                  <div>
                    <label htmlFor="qa-news-announcement" className="text-xs text-[#001428] font-bold cursor-pointer block">
                      Mostrar en el Aviso Interno de la portada (banner con megáfono)
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Solo un comunicado puede estar en el aviso a la vez. Al marcarlo, sustituirá cualquier aviso anterior.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-col-reverse sm:flex-row items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto text-center px-4 py-2.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold transition-colors cursor-pointer border border-slate-200 sm:border-transparent"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 bg-[#001428] hover:bg-[#0e4a7b] text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Publicar en Portada
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
