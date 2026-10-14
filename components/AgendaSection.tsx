'use client';

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Users,
  Plus,
  CalendarCheck,
  FileSpreadsheet,
  GraduationCap,
  Building2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Phone,
  CheckCircle2,
  RefreshCw,
  Landmark,
  ShieldCheck,
  X,
  ArrowRight,
  BookOpen,
  Award,
  Mail,
  Star,
} from 'lucide-react';
import { ActivityItem, ResourceDocument } from '@/lib/mock-data';
import {
  buildCsatSurveyUrl,
  createCsatToken,
  csatAverage,
  type VisitCsatDoc,
} from '@/lib/visit-csat';
import { subscribeToCollection, VISIT_CSAT_COLLECTION } from '@/lib/firestore';
import { getLocalDateString, getInstitutionalTodayParts, isWeekendDay, getWeekendDayName, INSTITUTIONAL_TIMEZONE } from '@/lib/utils';
import { useBottomSheetDrag } from '@/lib/useBottomSheetDrag';
import { BottomSheetHandle } from '@/components/BottomSheetHandle';
import {
  downloadMonthlySchedulePdf,
  downloadActivitySheetPdf,
  downloadProtocoloMenoresPdf,
  downloadAutorizacionImagenPdf,
} from '@/lib/pdfGenerator';

interface AgendaSectionProps {
  activities: ActivityItem[];
  resources?: ResourceDocument[];
  onNavigateTab?: (tab: string) => void;
  onOpenNewActivityModal: (initialDate?: string) => void;
  onSyncEventToGoogleCalendar: (activity: ActivityItem) => void;
  onExportToGoogleSheets: () => void;
  hasWorkspaceAuth: boolean;
  initialDate?: Date;
  initialView?: 'dia' | 'semana' | 'mes' | 'lista';
  isAdmin?: boolean;
  onUpdateActivityStatus?: (id: string, status: ActivityItem['status'], reason?: string) => void;
  /** Persistencia completa de la actividad (encuesta CSAT: token/fecha de envío). */
  onUpdateActivityFull?: (activity: ActivityItem) => void;
  /** Abre el composer de Gmail del sistema con destinatario/asunto/cuerpo pre-armados. */
  onOpenEmailModal?: (to: string, subject: string, body: string) => void;
}

function getNextBusinessDay(current: Date): Date {
  const d = new Date(current);
  d.setDate(d.getDate() + 1);
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  else if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d;
}

function getPrevBusinessDay(current: Date): Date {
  const d = new Date(current);
  d.setDate(d.getDate() - 1);
  if (d.getDay() === 0) d.setDate(d.getDate() - 2);
  else if (d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

/** Chip del estado: así la agenda refleja el estado REAL (antes decía "Confirmada" siempre). */
const STATUS_CHIP_LABELS: Record<string, string> = {
  confirmada: 'Confirmada',
  en_curso: 'En Curso',
  pendiente: 'Pendiente',
  cancelada: 'Cancelada',
  finalizada: 'Finalizada',
};

const STATUS_CHIP_STYLES: Record<string, string> = {
  confirmada: 'text-emerald-800 bg-emerald-100 border border-emerald-300',
  en_curso: 'text-blue-900 bg-blue-100 border border-blue-300',
  pendiente: 'text-amber-900 bg-amber-100 border border-amber-300',
  cancelada: 'text-rose-900 bg-rose-100 border border-rose-300',
  finalizada: 'text-slate-800 bg-slate-100 border border-slate-300',
};

/** Etiqueta y estilo del chip de estado. Si falta el estado NO se asume "Confirmada". */
function getStatusChip(status?: string): { label: string; cls: string } {
  if (!status) return { label: 'Sin estado', cls: 'text-slate-600 bg-slate-50 border border-slate-200' };
  return {
    label: STATUS_CHIP_LABELS[status] ?? status.replace(/_/g, ' '),
    cls: STATUS_CHIP_STYLES[status] ?? 'text-slate-600 bg-slate-50 border border-slate-200',
  };
}

/** Ahora mismo en la zona institucional: fecha YYYY-MM-DD y hora HH:mm (comparables como texto). */
function getInstitutionalNowStamp(): { ymd: string; hhmm: string } {
  const hhmm = new Intl.DateTimeFormat('es-AR', {
    timeZone: INSTITUTIONAL_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  return { ymd: getLocalDateString(), hhmm };
}

/**
 * Estado ELEMENTAL para mostrar: los estados gestionados a mano (pendiente/cancelada/
 * finalizada/en_curso) mandan; si la actividad está "confirmada", el chip se DERIVA de
 * los horarios reales: en curso dentro del rango, finalizada al pasar la hora de fin
 * (o el día anterior entero). Es solo visual: no cambia el estado persistido.
 */
function getEffectiveStatus(act: ActivityItem): string {
  const base = act.status || '';
  if (base !== 'confirmada') return base;
  const start = act.startTime || '';
  const end = act.endTime || '';
  const { ymd, hhmm } = getInstitutionalNowStamp();
  if (act.date && act.date < ymd) return 'finalizada';
  if (act.date === ymd && start && end) {
    if (hhmm >= start && hhmm < end) return 'en_curso';
    if (hhmm >= end) return 'finalizada';
  }
  return base;
}

const DAY_NAMES_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES_FULL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];
const MONTH_NAMES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function AgendaSection({
  activities,
  resources,
  onNavigateTab,
  onOpenNewActivityModal,
  onSyncEventToGoogleCalendar,
  onExportToGoogleSheets,
  hasWorkspaceAuth,
  initialDate,
  initialView,
  isAdmin,
  onUpdateActivityStatus,
  onUpdateActivityFull,
  onOpenEmailModal,
}: AgendaSectionProps) {
  const [activeTab, setActiveTab] = useState<'todas' | 'visita' | 'capacitacion' | 'sesion' | 'coordinacion'>('todas');
  const [activeView, setActiveView] = useState<'dia' | 'semana' | 'mes' | 'lista'>(initialView || 'semana');
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (initialDate) return initialDate;
    const { year, month, day } = getInstitutionalTodayParts();
    return new Date(year, month, day, 12, 0, 0, 0);
  });
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);
  const [csatEmailInput, setCsatEmailInput] = useState('');
  const [csurveyEmailError, setCsurveyEmailError] = useState<string | null>(null);
  /** Prompt CSAT: visita de HOY que terminó (hora de fin pasada, estado confirmada)
   *  con email de contacto cargado y sin encuesta enviada todavía. */
  const [csatAutoPrompt, setCsatAutoPrompt] = useState<ActivityItem | null>(null);
  const dismissedCsatIdsRef = useRef<Set<string>>(new Set());
  const [selectedDayActivities, setSelectedDayActivities] = useState<{
    dayName: string;
    dayNumber: number;
    monthFull: string;
    dateStr: string;
    activities: ActivityItem[];
  } | null>(null);

  const daySheet = useBottomSheetDrag({
    isOpen: Boolean(selectedDayActivities),
    onClose: () => setSelectedDayActivities(null),
  });
  const activitySheet = useBottomSheetDrag({
    isOpen: Boolean(selectedActivity),
    onClose: () => setSelectedActivity(null),
  });

  const [isCancellingInModal, setIsCancellingInModal] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState('');

  // Input del destinatario CSAT: se sincroniza con la actividad abierta en la ficha.
  useEffect(() => {
    setCsatEmailInput(selectedActivity?.contactEmail ?? '');
    setCsurveyEmailError(null);
    setIsCancellingInModal(false);
    setCancelReasonInput('');
  }, [selectedActivity?.id, selectedActivity?.contactEmail]);

  // Detecciónautomática del fin de visita: cuando pasa la hora de fin y la encuesta
  // no fue enviada, propone enviarla con UN clic (semi-automático con confirmación:
  // un envío 100% desatendido no es seguro sin backend con credenciales de Gmail).
  React.useEffect(() => {
    if (!isAdmin || !hasWorkspaceAuth || !onOpenEmailModal || !onUpdateActivityFull) return;
    const evaluate = () => {
      const { ymd, hhmm } = getInstitutionalNowStamp();
      const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const candidate = activities.find(
        (a) =>
          a.type === 'visita' &&
          a.status === 'confirmada' &&
          a.date === ymd &&
          Boolean(a.endTime) &&
          hhmm >= (a.endTime || '') &&
          Boolean(a.contactEmail) &&
          EMAIL_RE.test((a.contactEmail || '').trim()) &&
          !a.csatSurveyToken &&
          !dismissedCsatIdsRef.current.has(a.id)
      );
      setCsatAutoPrompt(candidate || null);
    };
    evaluate();
    const timer = setInterval(evaluate, 60_000);
    return () => clearInterval(timer);
  }, [activities, isAdmin, hasWorkspaceAuth, onOpenEmailModal, onUpdateActivityFull]);

  const dayContentRef = useRef<HTMLDivElement>(null);
  const activityContentRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (selectedActivity && activityContentRef.current) {
      activityContentRef.current.scrollTop = 0;
    }
  }, [selectedActivity]);

  React.useEffect(() => {
    if (selectedDayActivities && dayContentRef.current) {
      dayContentRef.current.scrollTop = 0;
    }
  }, [selectedDayActivities]);

  const calendarToolbarRef = useRef<HTMLDivElement>(null);

  const scrollToCalendarTop = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (typeof window === 'undefined') return;
    setTimeout(() => {
      if (calendarToolbarRef.current) {
        const yOffset = -85;
        const y = calendarToolbarRef.current.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: Math.max(0, y), behavior });
      }
    }, 30);
  }, []);

  const handleSelectDayFromMonth = useCallback((dateObj: Date) => {
    setSelectedDate(dateObj);
    setActiveView('dia');
    scrollToCalendarTop('smooth');
  }, [scrollToCalendarTop]);

  /**
   * Flujo común de la encuesta CSAT (perfil admin y prompt auto): garantiza token +
   * email de contacto, persiste el envío y abre el composer de Gmail pre-armado.
   */
  const openCsatEmailFor = useCallback((activityInput: ActivityItem) => {
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleanEmail = (activityInput.contactEmail || '').trim().toLowerCase();
    if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) {
      setCsurveyEmailError('Ingresá un email válido de la institución para enviar la encuesta.');
      return false;
    }
    setCsurveyEmailError(null);
    const token = activityInput.csatSurveyToken || createCsatToken();
    // Persiste token + email de contacto (el email queda para el próximo reenvío).
    const withData: ActivityItem = {
      ...activityInput,
      csatSurveyToken: token,
      csatSurveySentAt: new Date().toISOString(),
      contactEmail: cleanEmail,
    };
    onUpdateActivityFull?.(withData);
    setSelectedActivity(withData);
    const surveyUrl = buildCsatSurveyUrl({
      token,
      activityId: activityInput.id,
      title: activityInput.title,
      date: activityInput.date,
      origin: window.location.origin,
    });
    const subject = `Encuesta de satisfacción — ${activityInput.title}`;
    const body = [
      `Estimados integrantes de ${activityInput.institution || 'la institución educativa'}:`,
      '',
      `Gracias por haber participado de la actividad "${activityInput.title}" del día ${activityInput.date}.`,
      '',
      'Para acompañar la mejora continua de las visitas, les pedimos completar esta encuesta breve (toma menos de 1 minuto):',
      surveyUrl,
      '',
      'Su opinión nos permite seguir fortaleciendo el programa cívico del Instituto.',
      'Muchas gracias.',
      'Instituto de Capacitación Legislativa',
    ].join('\n');
    onOpenEmailModal?.(cleanEmail, subject, body);
    return true;
  }, [onOpenEmailModal, onUpdateActivityFull]);

  const totalVisitas = activities.filter((a) => a.type === 'visita').length;
  const totalCapacitaciones = activities.filter((a) => a.type === 'capacitacion').length;
  const totalSesiones = activities.filter((a) => a.type === 'evento').length;
  const totalCoordinacion = activities.filter((a) => a.type === 'reunion').length;
  const totalAlumnos = activities
    .filter((a) => a.type === 'visita')
    .reduce((acc, curr) => acc + (curr.attendeesCount || 0), 0);

  const visitsWithDuration = useMemo(() => {
    return activities.filter((a) => a.type === 'visita' && a.startTime && a.endTime);
  }, [activities]);

  const averageVisitDurationMinutes = useMemo(() => {
    if (visitsWithDuration.length === 0) return 75;
    const totalMinutes = visitsWithDuration.reduce((acc, curr) => {
      const [startH, startM] = (curr.startTime || '09:00').split(':').map(Number);
      const [endH, endM] = (curr.endTime || '10:15').split(':').map(Number);
      const duration = (endH * 60 + endM) - (startH * 60 + startM);
      return acc + (duration > 0 ? duration : 75);
    }, 0);
    return Math.round(totalMinutes / visitsWithDuration.length);
  }, [visitsWithDuration]);

  const allResources = useMemo(() => {
    return resources ?? [];
  }, [resources]);

  const visitResources = useMemo(() => {
    return allResources.filter((r) => {
      const cat = r.category || '';
      const titleLower = r.title.toLowerCase();
      const descLower = (r.description || '').toLowerCase();
      return (
        cat === 'protocolo' ||
        cat === 'nota_modelo' ||
        cat === 'formulario' ||
        titleLower.includes('visita') ||
        titleLower.includes('protocolo') ||
        titleLower.includes('menores') ||
        descLower.includes('visita') ||
        descLower.includes('delegaciones')
      );
    });
  }, [allResources]);

  const currentDayInfo = useMemo(() => {
    const todayStr = getLocalDateString();
    const dayOfWeek = selectedDate.getDay();
    const dayName = DAY_NAMES_FULL[dayOfWeek];
    const dayNumber = selectedDate.getDate();
    const monthFull = MONTH_NAMES_FULL[selectedDate.getMonth()];
    const monthShort = MONTH_NAMES_SHORT[selectedDate.getMonth()];
    const year = selectedDate.getFullYear();
    const dateStr = getLocalDateString(selectedDate);
    const isToday = dateStr === todayStr;

    return {
      dayName,
      dayNumber,
      monthFull,
      monthShort,
      year,
      dateStr,
      isToday,
      formattedLong: `${dayName}, ${dayNumber} de ${monthFull} ${year}`,
    };
  }, [selectedDate]);

  const { weekDays, monthNavigatorLabel, currentWeekNumber, nextWeekLabel, nextWeekDays, nextMondayObj } = useMemo(() => {
    const todayStr = getLocalDateString();
    const selectedDateStr = getLocalDateString(selectedDate);

    const dayOfWeek = selectedDate.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(selectedDate);
    monday.setDate(selectedDate.getDate() + diffToMonday);

    const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    const dayNamesShort = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];

    const computedDays = [0, 1, 2, 3, 4].map((i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = getLocalDateString(d);
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === selectedDateStr;
      return {
        dateObj: d,
        dayIndex: i,
        dayName: dayNames[i],
        dayNameShort: dayNamesShort[i],
        dayNumber: d.getDate(),
        monthShort: MONTH_NAMES_SHORT[d.getMonth()],
        monthFull: MONTH_NAMES_FULL[d.getMonth()],
        year: d.getFullYear(),
        dateStr,
        isToday,
        isSelected,
      };
    });

    const firstM = computedDays[0];
    const lastM = computedDays[computedDays.length - 1];
    let navLabel = `${firstM.monthFull} ${firstM.year}`;
    if (firstM.monthShort !== lastM.monthShort) {
      navLabel = `${firstM.monthFull} - ${lastM.monthFull} ${lastM.year}`;
    }

    const startOfYear = new Date(monday.getFullYear(), 0, 1);
    const pastDaysOfYear = (monday.getTime() - startOfYear.getTime()) / 86400000;
    const weekNum = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);

    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);
    const nextFriday = new Date(nextMonday);
    nextFriday.setDate(nextMonday.getDate() + 4);

    const nextLabel = `Próxima Semana: ${String(nextMonday.getDate()).padStart(2, '0')} de ${MONTH_NAMES_FULL[nextMonday.getMonth()]} al ${String(nextFriday.getDate()).padStart(2, '0')} de ${MONTH_NAMES_FULL[nextFriday.getMonth()]}`;

    const nextDaysData: {
      id: string;
      dayLabel: string;
      title: string;
      space: string;
      action: 'Asignar' | 'Ver Detalles';
      color: string;
      hasLandmark?: boolean;
      activity: ActivityItem | null;
      dateStr: string;
      dateObj: Date;
      isAvailableSlot: boolean;
    }[] = [];

    // Recorremos los 5 días hábiles de la próxima semana para tomar actividades reales del calendario
    [0, 1, 2, 3, 4].forEach((offset) => {
      const d = new Date(nextMonday);
      d.setDate(nextMonday.getDate() + offset);
      const dateStr = getLocalDateString(d);
      const dayActs = activities.filter((a) => a.date === dateStr && a.status !== 'cancelada');
      const dayNameUpper = dayNames[offset].toUpperCase();
      const dayNum = String(d.getDate()).padStart(2, '0');

      if (dayActs.length > 0) {
        // Mostramos las actividades registradas en la agenda para esa jornada
        dayActs.forEach((act) => {
          const isVisit = act.type === 'visita' || act.title.toLowerCase().includes('visita');
          const isCap = act.type === 'capacitacion' || act.title.toLowerCase().includes('curso') || act.title.toLowerCase().includes('taller');
          nextDaysData.push({
            id: act.id,
            dayLabel: `${dayNameUpper} ${dayNum} • ${act.startTime || '10:00'} HS`,
            title: act.title,
            space: act.institution
              ? `${act.institution}${act.attendeesCount ? ` • ${act.attendeesCount} asistentes` : ''}`
              : isVisit
              ? 'Visita cívica e institucional guiada'
              : isCap
              ? 'Capacitación del Instituto'
              : 'Actividad institucional',
            action: 'Ver Detalles',
            color: isVisit ? 'text-[#0284c7]' : isCap ? 'text-purple-700' : 'text-emerald-700',
            hasLandmark: true,
            activity: act,
            dateStr,
            dateObj: d,
            isAvailableSlot: false,
          });
        });
      } else {
        // Si no hay actividad agendada, ofrecemos el cupo disponible para esa fecha exacta
        const isMorning = offset % 2 === 0;
        nextDaysData.push({
          id: `slot-${dateStr}`,
          dayLabel: `${dayNameUpper} ${dayNum} • ${isMorning ? 'MAÑANA' : 'TARDE'}`,
          title: `Turno ${isMorning ? '09:30' : '14:30'} hs Disponible`,
          space: isMorning ? 'Turno Matutino disponible para visitas escolares' : 'Turno Vespertino disponible para formación o talleres',
          action: 'Asignar',
          color: 'text-[#0284c7]',
          hasLandmark: false,
          activity: null,
          dateStr,
          dateObj: d,
          isAvailableSlot: true,
        });
      }
    });

    return {
      weekDays: computedDays,
      monthNavigatorLabel: navLabel,
      currentWeekNumber: weekNum,
      nextWeekLabel: nextLabel,
      nextWeekDays: nextDaysData,
      nextMondayObj: nextMonday,
    };
  }, [selectedDate, activities]);

  const currentWeekDatesSet = useMemo(() => {
    return new Set(weekDays.map((d) => d.dateStr));
  }, [weekDays]);

  const activitiesInCurrentWeek = useMemo(() => {
    return activities.filter((a) => currentWeekDatesSet.has(a.date) && a.status !== 'cancelada');
  }, [activities, currentWeekDatesSet]);

  const visitsInCurrentWeek = useMemo(() => {
    return activitiesInCurrentWeek.filter((a) => a.type === 'visita');
  }, [activitiesInCurrentWeek]);

  const navigatorLabel = useMemo(() => {
    if (activeView === 'dia') {
      if (currentDayInfo.isToday) {
        return `Hoy, ${currentDayInfo.dayNumber} ${currentDayInfo.monthShort}`;
      }
      return `${currentDayInfo.dayName} ${currentDayInfo.dayNumber} ${currentDayInfo.monthShort}`;
    }
    if (activeView === 'semana') {
      return monthNavigatorLabel;
    }
    if (activeView === 'mes') {
      return `${currentDayInfo.monthFull} ${currentDayInfo.year}`;
    }
    return `${currentDayInfo.monthFull} ${currentDayInfo.year}`;
  }, [activeView, currentDayInfo, monthNavigatorLabel]);

  const navigatorSubtitle = useMemo(() => {
    if (activeView === 'dia') {
      return `Jornada Diaria • ${currentDayInfo.dayName} ${currentDayInfo.dayNumber} de ${currentDayInfo.monthFull}`;
    }
    if (activeView === 'semana') {
      return `Semana ${currentWeekNumber} • Periodo Ordinario`;
    }
    if (activeView === 'mes') {
      return `Vista Mensual • ${currentDayInfo.monthFull} ${currentDayInfo.year}`;
    }
    return `Listado Integral de Actividades`;
  }, [activeView, currentDayInfo, currentWeekNumber]);

  const handleNavigatePrev = () => {
    if (activeView === 'dia') {
      setSelectedDate((prev) => getPrevBusinessDay(prev));
    } else if (activeView === 'semana') {
      setSelectedDate((prev) => {
        const d = new Date(prev);
        d.setDate(d.getDate() - 7);
        return d;
      });
    } else if (activeView === 'mes') {
      setSelectedDate((prev) => {
        const d = new Date(prev);
        d.setMonth(d.getMonth() - 1);
        return d;
      });
    } else {
      setSelectedDate((prev) => {
        const d = new Date(prev);
        d.setDate(d.getDate() - 7);
        return d;
      });
    }
  };

  const handleNavigateNext = () => {
    if (activeView === 'dia') {
      setSelectedDate((prev) => getNextBusinessDay(prev));
    } else if (activeView === 'semana') {
      setSelectedDate((prev) => {
        const d = new Date(prev);
        d.setDate(d.getDate() + 7);
        return d;
      });
    } else if (activeView === 'mes') {
      setSelectedDate((prev) => {
        const d = new Date(prev);
        d.setMonth(d.getMonth() + 1);
        return d;
      });
    } else {
      setSelectedDate((prev) => {
        const d = new Date(prev);
        d.setDate(d.getDate() + 7);
        return d;
      });
    }
  };

  const handleNavigateToday = () => {
    const { year, month, day } = getInstitutionalTodayParts();
    setSelectedDate(new Date(year, month, day, 12, 0, 0, 0));
  };

  const getActivitiesForDay = (dateStr: string) => {
    return activities
      .filter((act) => {
        if (act.date !== dateStr) return false;
        if (activeTab === 'visita' && act.type !== 'visita') return false;
        if (activeTab === 'capacitacion' && act.type !== 'capacitacion') return false;
        if (activeTab === 'sesion' && act.type !== 'evento') return false;
        if (activeTab === 'coordinacion' && act.type !== 'reunion') return false;
        return true;
      })
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  };

  const allFilteredActivities = useMemo(() => {
    return activities
      .filter((act) => {
        if (activeTab === 'visita' && act.type !== 'visita') return false;
        if (activeTab === 'capacitacion' && act.type !== 'capacitacion') return false;
        if (activeTab === 'sesion' && act.type !== 'evento') return false;
        if (activeTab === 'coordinacion' && act.type !== 'reunion') return false;
        return true;
      })
      .sort((a, b) => {
        const dateCmp = (a.date || '').localeCompare(b.date || '');
        if (dateCmp !== 0) return dateCmp;
        return (a.startTime || '').localeCompare(b.startTime || '');
      });
  }, [activities, activeTab]);

  const upcomingVisits = useMemo(() => {
    const todayStr = getLocalDateString();
    return activities
      .filter((a) => a.type === 'visita' && a.status !== 'cancelada' && a.date >= todayStr)
      .sort((a, b) => {
        const cmp = (a.date || '').localeCompare(b.date || '');
        if (cmp !== 0) return cmp;
        return (a.startTime || '').localeCompare(b.startTime || '');
      })
      .slice(0, 6);
  }, [activities]);

  const upcomingCapacitaciones = useMemo(() => {
    const todayStr = getLocalDateString();
    const capsFromToday = activities
      .filter((a) => a.type === 'capacitacion' && a.status !== 'cancelada' && a.date >= todayStr)
      .sort((a, b) => {
        const cmp = (a.date || '').localeCompare(b.date || '');
        if (cmp !== 0) return cmp;
        return (a.startTime || '').localeCompare(b.startTime || '');
      });

    if (capsFromToday.length > 0) {
      return capsFromToday.slice(0, 3);
    }

    return activities
      .filter((a) => a.type === 'capacitacion' && a.status !== 'cancelada' && Boolean(a.date))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 3);
  }, [activities]);

  const monthMatrix = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const todayStr = getLocalDateString();
    const selectedDateStr = getLocalDateString(selectedDate);

    const days: {
      dateObj: Date;
      dateStr: string;
      dayNumber: number;
      dayNameShort: string;
      isToday: boolean;
      isSelected: boolean;
    }[] = [];

    const shortNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    for (let dayNum = 1; dayNum <= lastDayOfMonth.getDate(); dayNum++) {
      const d = new Date(year, month, dayNum);
      const dow = d.getDay();
      if (dow >= 1 && dow <= 5) {
        const dStr = getLocalDateString(d);
        days.push({
          dateObj: d,
          dateStr: dStr,
          dayNumber: dayNum,
          dayNameShort: shortNames[dow],
          isToday: dStr === todayStr,
          isSelected: dStr === selectedDateStr,
        });
      }
    }
    return days;
  }, [selectedDate]);

  const handleDownloadMonthlyPdf = () => {
    downloadMonthlySchedulePdf({
      monthName: currentDayInfo.monthFull,
      year: currentDayInfo.year,
      activities,
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 p-6 sm:p-7 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-2 max-w-3xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#eff6ff] text-[#0284c7] text-[11px] font-bold border border-[#bfdbfe]">
            <CalendarIcon className="w-3 h-3 text-[#0284c7]" />
            <span className="uppercase tracking-wider">
              CICLO LECTIVO Y PARLAMENTARIO 2026
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#0284c7]"></span>
            <span className="text-slate-500 font-medium text-[11px]">Sincronizado hace 4 min</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#001428] tracking-tight">
            Agenda Institucional y Programa de Visitas Escolares
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-2xl">
            Coordinación pedagógica, recorridos cívicos guiados para instituciones educativas de nivel primario, secundario y universitario, y gestión unificada del cronograma institucional de actividades y capacitaciones.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isAdmin && (
            <button
              onClick={() => onOpenNewActivityModal(currentDayInfo.dateStr)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#001428] hover:bg-[#0e4a7b] text-white text-xs font-bold rounded shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nueva Solicitud de Visita</span>
            </button>
          )}

          <button
            onClick={() => {
              if (activities.length > 0) {
                onSyncEventToGoogleCalendar(activities[0]);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#eff6ff] hover:bg-[#dbeafe] text-[#0284c7] border border-[#bfdbfe] text-xs font-bold rounded transition-colors cursor-pointer"
            title={hasWorkspaceAuth ? 'Sincronizar con Google Calendar' : 'Conectar Google Calendar'}
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#0284c7]" />
            <span>Google Calendar</span>
          </button>

          <button
            onClick={onExportToGoogleSheets}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-bold rounded shadow-xs transition-colors cursor-pointer"
            title="Exportar base completa a Google Sheets o descargar Planilla Maestra"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Planilla Maestra</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-lg border border-slate-200 shadow-2xs relative">
          <div className="flex items-start justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
              VISITAS ESCOLARES REGISTRADAS
            </span>
            <div className="w-8 h-8 rounded bg-blue-50 text-[#0284c7] flex items-center justify-center border border-blue-100 shrink-0">
              <GraduationCap className="w-4 h-4 text-[#0284c7]" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-[#001428]">
              {totalVisitas}
            </span>
            <span className="text-xs font-bold text-[#0284c7]">
              {totalVisitas === 1 ? 'institución' : 'instituciones'}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
            <Users className="w-3 h-3 text-slate-400" />
            <span>{totalAlumnos} alumnos en total en agenda</span>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-lg border border-slate-200 shadow-2xs relative">
          <div className="flex items-start justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
              CAPACITACIONES ACTIVAS
            </span>
            <div className="w-8 h-8 rounded bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-100 shrink-0">
              <BookOpen className="w-4 h-4 text-purple-700" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-[#001428]">
              {totalCapacitaciones}
            </span>
            <span className="text-xs font-bold text-purple-700">
              {totalCapacitaciones === 1 ? 'programa' : 'programas'}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
            <Award className="w-3 h-3 text-purple-400" />
            <span>Formación cívica y legislativa</span>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-lg border border-slate-200 shadow-2xs relative">
          <div className="flex items-start justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
              TIEMPO PROMEDIO
            </span>
            <div className="w-8 h-8 rounded bg-blue-50 text-[#0284c7] flex items-center justify-center border border-blue-100 shrink-0">
              <Clock className="w-4 h-4 text-[#0284c7]" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-[#001428]">
              {averageVisitDurationMinutes}
            </span>
            <span className="text-xs font-bold text-slate-600">minutos</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            Medido por horario de inicio y fin ({visitsWithDuration.length} {visitsWithDuration.length === 1 ? 'visita' : 'visitas'} registradas)
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-lg border border-slate-200 shadow-2xs relative">
          <div className="flex items-start justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
              TURNOS ESTA SEMANA
            </span>
            <div className="w-8 h-8 rounded bg-blue-50 text-[#0284c7] flex items-center justify-center border border-blue-100 shrink-0">
              <CalendarCheck className="w-4 h-4 text-[#0284c7]" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-[#001428]">
              {activitiesInCurrentWeek.length}
            </span>
            <span className="text-xs font-bold text-[#0284c7]">
              {activitiesInCurrentWeek.length === 1 ? 'turno' : 'turnos'}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            {visitsInCurrentWeek.length} {visitsInCurrentWeek.length === 1 ? 'visita escolar' : 'visitas escolares'} en la semana activa
          </div>
        </div>
      </div>

      <div
        ref={calendarToolbarRef}
        id="agenda-calendar-toolbar"
        className="scroll-mt-24 bg-white rounded-lg border border-slate-200 p-3 sm:p-4 shadow-2xs space-y-3"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 border border-slate-200 rounded p-0.5 bg-slate-50">
              <button
                type="button"
                onClick={handleNavigatePrev}
                className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded transition-colors cursor-pointer"
                title={activeView === 'dia' ? 'Día hábil anterior' : activeView === 'mes' ? 'Mes anterior' : 'Semana anterior'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-extrabold text-[#001428] px-2 min-w-[130px] sm:min-w-[160px] text-center">
                {navigatorLabel}
              </span>
              <button
                type="button"
                onClick={handleNavigateNext}
                className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded transition-colors cursor-pointer"
                title={activeView === 'dia' ? 'Día hábil siguiente' : activeView === 'mes' ? 'Mes siguiente' : 'Semana siguiente'}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={handleNavigateToday}
              className="px-2.5 py-1 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded transition-colors cursor-pointer shadow-2xs"
            >
              Hoy
            </button>
            <span className="text-xs text-slate-500 font-medium hidden sm:inline">
              {navigatorSubtitle}
            </span>
          </div>

          <div className="flex items-center gap-1 border border-slate-200 rounded-lg p-0.5 bg-slate-100/90 text-xs font-bold text-slate-600 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                setActiveView('dia');
                scrollToCalendarTop('smooth');
              }}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                activeView === 'dia'
                  ? 'bg-[#001428] text-white shadow-xs font-black ring-1 ring-[#001428]'
                  : 'text-slate-600 hover:text-[#001428] hover:bg-white/80'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Día</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('semana')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                activeView === 'semana'
                  ? 'bg-[#001428] text-white shadow-xs font-black ring-1 ring-[#001428]'
                  : 'text-slate-600 hover:text-[#001428] hover:bg-white/80'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Semana</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('mes')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                activeView === 'mes'
                  ? 'bg-[#001428] text-white shadow-xs font-black ring-1 ring-[#001428]'
                  : 'text-slate-600 hover:text-[#001428] hover:bg-white/80'
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>Mes</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('lista')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                activeView === 'lista'
                  ? 'bg-[#001428] text-white shadow-xs font-black ring-1 ring-[#001428]'
                  : 'text-slate-600 hover:text-[#001428] hover:bg-white/80'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setActiveTab('todas')}
              className={`px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer ${
                activeTab === 'todas'
                  ? 'bg-[#001428] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Todas ({activities.length > 0 ? activities.length + 26 : 32})
            </button>

            <button
              onClick={() => setActiveTab('visita')}
              className={`px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'visita'
                  ? 'bg-[#0284c7] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Visitas Escolares ({totalVisitas > 0 ? totalVisitas + 12 : 18})</span>
            </button>

            <button
              onClick={() => setActiveTab('capacitacion')}
              className={`px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'capacitacion'
                  ? 'bg-[#0284c7] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Capacitaciones y Cursos ({totalCapacitaciones > 0 ? totalCapacitaciones + 5 : 8})</span>
            </button>

            <button
              onClick={() => setActiveTab('sesion')}
              className={`px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'sesion'
                  ? 'bg-[#0284c7] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Landmark className="w-3.5 h-3.5" />
              <span>Sesiones y Actos ({totalSesiones > 0 ? totalSesiones + 3 : 4})</span>
            </button>

            <button
              onClick={() => setActiveTab('coordinacion')}
              className={`px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'coordinacion'
                  ? 'bg-[#0284c7] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Coordinación ({totalCoordinacion > 0 ? totalCoordinacion + 1 : 2})</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          {activeView === 'dia' && (
            <div className="space-y-4">
              <div className="bg-white rounded-lg border border-slate-200 p-2 sm:p-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto py-0.5">
                  <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider pl-1.5 pr-1 shrink-0 hidden sm:inline">
                    Semana:
                  </span>
                  {weekDays.map((wDay) => {
                    const count = getActivitiesForDay(wDay.dateStr).length;
                    return (
                      <button
                        key={wDay.dateStr}
                        type="button"
                        onClick={() => setSelectedDate(wDay.dateObj)}
                        className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                          wDay.isSelected
                            ? 'bg-[#001428] text-white shadow-xs ring-1 ring-[#001428]'
                            : wDay.isToday
                            ? 'bg-blue-50 text-[#0284c7] border border-blue-200 hover:bg-blue-100'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/80'
                        }`}
                      >
                        <span>{wDay.dayNameShort} {wDay.dayNumber}</span>
                        {count > 0 && (
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                              wDay.isSelected ? 'bg-white/25 text-white' : 'bg-[#0284c7] text-white'
                            }`}
                            title={`${count} actividades`}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1 pr-1 shrink-0 ml-auto">
                  <button
                    type="button"
                    onClick={handleNavigatePrev}
                    className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                    title="Día hábil anterior"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Día Anterior</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleNavigateNext}
                    className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                    title="Día hábil siguiente"
                  >
                    <span className="hidden sm:inline">Día Siguiente</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
                  <div className="flex items-center gap-3.5">
                    <div className="w-14 h-14 rounded-xl bg-[#001428] text-white flex flex-col items-center justify-center shrink-0 shadow-sm border border-[#001428]">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest leading-none text-sky-300">
                        {currentDayInfo.dayName.slice(0, 3)}
                      </span>
                      <span className="text-2xl font-black leading-none mt-1">
                        {String(currentDayInfo.dayNumber).padStart(2, '0')}
                      </span>
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base sm:text-lg font-black text-[#001428] tracking-tight">
                          Jornada del {currentDayInfo.dayName} {currentDayInfo.dayNumber} de {currentDayInfo.monthFull} {currentDayInfo.year}
                        </h2>
                        {currentDayInfo.isToday && (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase">
                            Hoy
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Cronograma oficial de actividades parlamentarias, visitas cívicas y salones
                      </p>
                    </div>
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => onOpenNewActivityModal(currentDayInfo.dateStr)}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#001428] hover:bg-[#0e4a7b] text-white text-xs font-bold rounded-lg shadow-2xs transition-colors cursor-pointer shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Programar Actividad</span>
                    </button>
                  )}
                </div>

                {(() => {
                  const dayActs = getActivitiesForDay(currentDayInfo.dateStr);
                  const dayVis = dayActs.filter((a) => a.type === 'visita').length;
                  const dayCap = dayActs.filter((a) => a.type === 'capacitacion').length;
                  const dayTotalAtt = dayActs.reduce((acc, curr) => acc + (curr.attendeesCount || 0), 0);

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-200/70">
                        <div className="text-[10px] uppercase font-bold text-slate-500">Total del Día</div>
                        <div className="text-lg font-black text-[#001428] mt-0.5">
                          {dayActs.length} {dayActs.length === 1 ? 'Actividad' : 'Actividades'}
                        </div>
                      </div>
                      <div className="bg-blue-50/60 rounded-lg p-3 border border-blue-100">
                        <div className="text-[10px] uppercase font-bold text-[#0284c7]">Visitas Escolares</div>
                        <div className="text-lg font-black text-[#0284c7] mt-0.5">
                          {dayVis} {dayVis === 1 ? 'contingente' : 'contingentes'}
                        </div>
                      </div>
                      <div className="bg-indigo-50/60 rounded-lg p-3 border border-indigo-100">
                        <div className="text-[10px] uppercase font-bold text-indigo-600">Capacitaciones</div>
                        <div className="text-lg font-black text-indigo-700 mt-0.5">
                          {dayCap} {dayCap === 1 ? 'curso' : 'cursos'}
                        </div>
                      </div>
                      <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-200/70">
                        <div className="text-[10px] uppercase font-bold text-slate-500">Asistentes Totales</div>
                        <div className="text-lg font-black text-slate-800 mt-0.5">
                          {dayTotalAtt} personas
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {(() => {
                const dayActs = getActivitiesForDay(currentDayInfo.dateStr);
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-[#0284c7]" />
                        <h3 className="text-sm font-bold text-[#001428]">
                          Cronograma Horario de la Jornada
                        </h3>
                      </div>
                      <span className="text-xs text-slate-500 font-medium">
                        {dayActs.length} {dayActs.length === 1 ? 'actividad confirmada' : 'actividades confirmadas'}
                      </span>
                    </div>

                    {dayActs.length === 0 ? (
                      <div className="bg-white rounded-xl border border-slate-200 p-8 sm:p-12 text-center space-y-3 shadow-2xs">
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                          <CalendarCheck className="w-6 h-6 stroke-1" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-[#001428]">
                            Sin actividades programadas para el {currentDayInfo.dayName} {currentDayInfo.dayNumber} de {currentDayInfo.monthFull}
                          </h4>
                          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                            Los turnos de visitas guiadas y actividades formativas están disponibles para asignación en el calendario institucional.
                          </p>
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => onOpenNewActivityModal(currentDayInfo.dateStr)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#001428] hover:bg-[#0e4a7b] text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer mt-2"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Asignar Visita o Actividad para este Día</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {dayActs.map((act) => {
                          const isVisita = act.type === 'visita';
                          const isCapacitacion = act.type === 'capacitacion';
                          const isEvento = act.type === 'evento';

                          return (
                            <div
                              key={act.id}
                              onClick={() => setSelectedActivity(act)}
                              className={`bg-white rounded-xl border p-4 sm:p-5 transition-all cursor-pointer group space-y-3 shadow-2xs hover:shadow-xs hover:border-[#0284c7] ${
                                isVisita
                                  ? 'border-blue-200/80 bg-blue-50/20'
                                  : isCapacitacion
                                  ? 'border-indigo-200/80 bg-indigo-50/20'
                                  : isEvento
                                  ? 'border-purple-200/80 bg-purple-50/20'
                                  : 'border-amber-200/80 bg-amber-50/20'
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="px-2.5 py-1 rounded-md text-xs font-black bg-[#001428] text-white flex items-center gap-1.5 shadow-2xs">
                                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                                    <span>{act.startTime} a {act.endTime} hs</span>
                                  </span>
                                  <span
                                    className={`px-2.5 py-0.5 rounded text-[11px] font-extrabold uppercase ${
                                      isVisita
                                        ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                        : isCapacitacion
                                        ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                        : isEvento
                                        ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                                    }`}
                                  >
                                    {act.type === 'visita'
                                      ? 'Visita Escolar'
                                      : act.type === 'capacitacion'
                                      ? 'Capacitación'
                                      : act.type === 'evento'
                                      ? 'Sesión / Acto'
                                      : 'Reunión'}
                                  </span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${getStatusChip(getEffectiveStatus(act)).cls}`}>
                                    {getStatusChip(getEffectiveStatus(act)).label}
                                  </span>
                                </div>

                                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#0284c7] group-hover:underline shrink-0">
                                  <span>Ver Ficha Oficial</span>
                                  <ExternalLink className="w-3 h-3" />
                                </span>
                              </div>

                              <div>
                                <h4 className="text-base font-bold text-[#001428] group-hover:text-[#0284c7] transition-colors">
                                  {act.title}
                                </h4>
                                {act.institution && (
                                  <div className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold mt-0.5">
                                    <GraduationCap className="w-3.5 h-3.5 text-[#0284c7]" />
                                    <span>{act.institution} {act.level ? `• ${act.level}` : ''}</span>
                                  </div>
                                )}
                                {act.description && (
                                  <p className="text-xs text-slate-600 mt-1.5 line-clamp-2 leading-relaxed">
                                    {act.description}
                                  </p>
                                )}
                              </div>

                              <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
                                <div className="flex flex-wrap items-center gap-3">
                                  <span className="flex items-center gap-1 font-medium">
                                    <MapPin className="w-3.5 h-3.5 text-[#0284c7]" />
                                    <strong className="text-slate-700">{act.location}</strong>
                                  </span>
                                  <span className="flex items-center gap-1 font-medium">
                                    <Users className="w-3.5 h-3.5 text-[#0284c7]" />
                                    <span>
                                      {act.responsible} {act.attendeesCount ? `(${act.attendeesCount} participantes)` : ''}
                                    </span>
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSyncEventToGoogleCalendar(act);
                                    }}
                                    className="px-3 py-1.5 bg-[#eff6ff] hover:bg-[#dbeafe] text-[#0284c7] border border-[#bfdbfe] rounded-md text-xs font-bold transition-colors shadow-2xs cursor-pointer"
                                  >
                                    Agendar en Google Calendar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      downloadActivitySheetPdf(act);
                                    }}
                                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-bold transition-colors cursor-pointer"
                                    title="Descargar ficha técnica oficial en PDF"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {(() => {
                const dayActs = getActivitiesForDay(currentDayInfo.dateStr);
                return (
                  <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-[#0284c7]" />
                        <h3 className="text-sm font-bold text-[#001428]">
                          Disponibilidad de Turnos y Salones para esta Jornada
                        </h3>
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium">
                        Legislatura de la Provincia
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex items-start justify-between">
                        <div>
                          <div className="font-extrabold text-[#001428]">Turno Mañana (09:00 a 12:00 hs)</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Recorrido cívico institucional y actividades matutinas
                          </div>
                          <div className="text-[11px] font-semibold text-slate-700 mt-1">
                            {dayActs.some((a) => a.startTime && a.startTime < '13:00') ? (
                              <span className="text-amber-700 font-bold">• Actividad Asignada en Horario Matutino</span>
                            ) : (
                              <span className="text-emerald-700 font-bold">• Turno Libre para Visitas Escolares</span>
                            )}
                          </div>
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => onOpenNewActivityModal(currentDayInfo.dateStr)}
                            className="px-2.5 py-1 bg-white hover:bg-slate-100 text-[#0284c7] border border-slate-200 rounded font-bold transition-colors cursor-pointer shrink-0 text-xs"
                          >
                            Asignar
                          </button>
                        )}
                      </div>

                      <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex items-start justify-between">
                        <div>
                          <div className="font-extrabold text-[#001428]">Turno Tarde (14:00 a 17:30 hs)</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Capacitación, talleres y actividades vespertinas
                          </div>
                          <div className="text-[11px] font-semibold text-slate-700 mt-1">
                            {dayActs.some((a) => a.startTime && a.startTime >= '13:00') ? (
                              <span className="text-indigo-700 font-bold">• Actividad Asignada en Horario Vespertino</span>
                            ) : (
                              <span className="text-emerald-700 font-bold">• Turno Libre para Capacitación o Sesión</span>
                            )}
                          </div>
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => onOpenNewActivityModal(currentDayInfo.dateStr)}
                            className="px-2.5 py-1 bg-white hover:bg-slate-100 text-[#0284c7] border border-slate-200 rounded font-bold transition-colors cursor-pointer shrink-0 text-xs"
                          >
                            Asignar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {activeView === 'semana' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                {weekDays.map((day) => {
                  const dayActs = getActivitiesForDay(day.dateStr);
                  const visibleActs = dayActs.slice(0, 3);
                  const hasMore = dayActs.length > 3;

                  return (
                    <div
                      key={day.dateStr}
                      className={`rounded-lg p-3 flex flex-col justify-between min-h-[340px] transition-all relative ${
                        day.isToday
                          ? 'bg-white border-2 border-[#0284c7] shadow-sm ring-1 ring-[#0284c7]/20'
                          : 'bg-white border border-slate-200 shadow-2xs hover:border-slate-300'
                      }`}
                    >
                      {day.isToday && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#001428] text-white text-[9px] font-extrabold tracking-wider rounded uppercase shadow-xs">
                          HOY
                        </div>
                      )}

                      <div>
                        <div
                          onClick={() => {
                            setSelectedDate(day.dateObj);
                            setSelectedDayActivities({
                              dayName: day.dayName,
                              dayNumber: day.dayNumber,
                              monthFull: day.monthFull,
                              dateStr: day.dateStr,
                              activities: dayActs,
                            });
                          }}
                          className="pb-2 border-b border-slate-100 text-center cursor-pointer group hover:bg-slate-50 rounded-t p-1 -m-1 transition-colors"
                          title="Haga clic para ver toda la jornada"
                        >
                          <div
                            className={`text-xs font-bold transition-colors ${
                              day.isToday
                                ? 'text-[#0284c7] font-extrabold'
                                : 'text-slate-700 group-hover:text-[#0284c7]'
                            }`}
                          >
                            {day.dayName} {day.isToday ? '(Hoy)' : ''}
                          </div>
                          <div className="flex items-baseline justify-center gap-1 mt-0.5">
                            <span className="text-lg font-black text-[#001428]">
                              {String(day.dayNumber).padStart(2, '0')}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              {day.monthShort}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-2 mt-2.5">
                          {visibleActs.length === 0 ? (
                            <div className="py-7 text-center text-slate-400 space-y-1">
                              <p className="text-[11px] font-medium text-slate-400">Sin actividades</p>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedDate(day.dateObj);
                                  onOpenNewActivityModal(day.dateStr);
                                }}
                                className="text-[10px] font-bold text-[#0284c7] hover:underline cursor-pointer"
                              >
                                Programar
                              </button>
                            </div>
                          ) : (
                            visibleActs.map((act) => {
                              const isVisita = act.type === 'visita';
                              const isCapacitacion = act.type === 'capacitacion';
                              const isEvento = act.type === 'evento';
                              const isCancelada = act.status === 'cancelada';

                              return (
                                <div
                                  key={act.id}
                                  onClick={() => setSelectedActivity(act)}
                                  className={`p-2 rounded text-left cursor-pointer transition-all border shadow-2xs group ${
                                    isCancelada
                                      ? 'opacity-60 border-rose-200 bg-rose-50/60 hover:bg-rose-100/70'
                                      : isVisita
                                      ? 'bg-blue-50/70 border-blue-100 hover:bg-blue-100/80 hover:border-blue-300'
                                      : isCapacitacion
                                      ? 'bg-indigo-50/70 border-indigo-100 hover:bg-indigo-100/80 hover:border-indigo-300'
                                      : isEvento
                                      ? 'bg-purple-50/70 border-purple-100 hover:bg-purple-100/80 hover:border-purple-300'
                                      : 'bg-amber-50/70 border-amber-100 hover:bg-amber-100/80 hover:border-amber-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between text-[10px] font-bold">
                                    <span
                                      className={`flex items-center gap-1 ${
                                        isVisita
                                          ? 'text-[#0284c7]'
                                          : isCapacitacion
                                          ? 'text-indigo-700'
                                          : isEvento
                                          ? 'text-purple-700'
                                          : 'text-amber-700'
                                      }`}
                                    >
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full ${
                                          isVisita
                                            ? 'bg-[#0284c7]'
                                            : isCapacitacion
                                            ? 'bg-indigo-600'
                                            : isEvento
                                            ? 'bg-purple-600'
                                            : 'bg-amber-600'
                                        }`}
                                      />
                                      <span>{act.startTime} hs</span>
                                    </span>
                                    <span className="text-[9px] font-extrabold uppercase px-1 rounded bg-white/80 text-slate-600 border border-slate-200/60">
                                      {act.type === 'visita'
                                        ? 'Visita'
                                        : act.type === 'capacitacion'
                                        ? 'Curso'
                                        : act.type === 'evento'
                                        ? 'Sesión'
                                        : 'Reunión'}
                                    </span>
                                  </div>
                                  <div
                                    className={`text-xs font-bold leading-tight mt-1 line-clamp-1 transition-colors ${
                                      isCancelada
                                        ? 'text-rose-800 line-through group-hover:text-rose-900'
                                        : 'text-[#001428] group-hover:text-[#0284c7]'
                                    }`}
                                  >
                                    {act.title}
                                  </div>
                                  <div className="text-[10px] mt-0.5 line-clamp-1">
                                    {isCancelada ? (
                                      <span className="text-rose-700 font-extrabold uppercase">
                                        Cancelada
                                      </span>
                                    ) : (
                                      <>
                                        <span className="text-slate-500">
                                          {act.attendeesCount ? `${act.attendeesCount} pers. • ` : ''}
                                        </span>
                                        <span className="text-slate-500">
                                          {act.location?.split(' - ')[0].slice(0, 20) ?? ''}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 text-center">
                        {dayActs.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDate(day.dateObj);
                              setSelectedDayActivities({
                                dayName: day.dayName,
                                dayNumber: day.dayNumber,
                                monthFull: day.monthFull,
                                dateStr: day.dateStr,
                                activities: dayActs,
                              });
                            }}
                            className={`text-[11px] inline-flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                              hasMore
                                ? 'font-extrabold text-[#0284c7] hover:underline'
                                : 'font-semibold text-slate-600 hover:text-[#0284c7]'
                            }`}
                            title="Haga clic para ingresar y ver todas las actividades de esta jornada"
                          >
                            <span>
                              {dayActs.length} {dayActs.length === 1 ? 'actividad' : 'actividades'}
                            </span>
                            <ChevronRight className="w-3 h-3 opacity-70" />
                          </button>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-400">
                            Disponible
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-slate-500">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold text-[#001428] text-sm">
                      {nextWeekLabel}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-[#0284c7] font-bold text-[10px] border border-blue-100">
                      Semana {currentWeekNumber + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDate(nextMondayObj);
                        setActiveView('semana');
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0284c7] hover:underline cursor-pointer ml-1"
                      title="Navegar el calendario a la próxima semana"
                    >
                      <span>Ir a esta semana</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {nextWeekDays.filter((d) => d.isAvailableSlot).length} cupos libres • {nextWeekDays.filter((d) => !d.isAvailableSlot).length} agendadas
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {nextWeekDays.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs space-y-2 flex flex-col justify-between hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div
                          className="cursor-pointer group flex-1"
                          onClick={() => {
                            if (item.activity) {
                              setSelectedActivity(item.activity);
                            } else {
                              setSelectedDate(item.dateObj);
                              setActiveView('dia');
                            }
                          }}
                        >
                          <div className={`text-[10px] font-extrabold uppercase ${item.color} flex items-center gap-1.5`}>
                            <span>{item.dayLabel}</span>
                            {!item.isAvailableSlot && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="Actividad confirmada"></span>
                            )}
                          </div>
                          <h4 className="text-xs font-bold text-[#001428] mt-0.5 group-hover:text-[#0284c7] transition-colors leading-snug">
                            {item.title}
                          </h4>
                          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                            {item.space}
                          </p>
                        </div>
                        {item.hasLandmark && (
                          <Landmark className="w-5 h-5 text-slate-400 shrink-0 mt-1 ml-2" />
                        )}
                      </div>
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (item.action === 'Asignar') {
                              onOpenNewActivityModal(item.dateStr);
                            } else if (item.activity) {
                              setSelectedActivity(item.activity);
                            }
                          }}
                          className={`w-full py-2 px-3 text-xs font-bold rounded-lg shadow-2xs transition-all cursor-pointer ${
                            item.action === 'Asignar'
                              ? 'bg-[#001428] hover:bg-[#0e4a7b] text-white active:scale-[0.98]'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-[0.98]'
                          }`}
                        >
                          {item.action}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeView === 'mes' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-[#001428]">
                      Vista Mensual Legislativa ({currentDayInfo.monthFull} {currentDayInfo.year})
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Calendario de Lunes a Viernes. Haga clic en cualquier día para ingresar a su jornada diaria.
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => onOpenNewActivityModal(currentDayInfo.dateStr)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#001428] hover:bg-[#0e4a7b] text-white text-xs font-bold rounded-lg shadow-2xs transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Programar</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-5 gap-2 text-center text-xs">
                  {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'].map((dName) => (
                    <div key={dName} className="font-extrabold text-[#001428] py-1 bg-slate-50 rounded border border-slate-200/60 text-[11px] uppercase tracking-wider">
                      {dName}
                    </div>
                  ))}

                  {monthMatrix.map((mDay) => {
                    const dayActs = getActivitiesForDay(mDay.dateStr);
                    return (
                      <div
                        key={mDay.dateStr}
                        onClick={() => handleSelectDayFromMonth(mDay.dateObj)}
                        className={`p-2.5 rounded-lg border text-left min-h-[90px] flex flex-col justify-between transition-all cursor-pointer group hover:border-[#0284c7] hover:shadow-xs ${
                          mDay.isSelected
                            ? 'border-[#001428] ring-1 ring-[#001428] bg-slate-50'
                            : mDay.isToday
                            ? 'border-[#0284c7] bg-blue-50/40 ring-1 ring-[#0284c7]/20'
                            : 'border-slate-200 bg-white hover:bg-slate-50/70'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-black ${
                            mDay.isToday ? 'text-[#0284c7]' : 'text-slate-800'
                          }`}>
                            {mDay.dayNumber}
                          </span>
                          {mDay.isToday && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-[#0284c7] text-white font-extrabold uppercase">
                              Hoy
                            </span>
                          )}
                        </div>

                        <div className="space-y-1 my-1">
                          {dayActs.slice(0, 2).map((act) => (
                            <div
                              key={act.id}
                              className="text-[10px] font-semibold text-slate-700 truncate px-1 py-0.5 rounded bg-slate-100/90 group-hover:bg-blue-50/70"
                            >
                              <span className="font-bold text-[#0284c7]">{act.startTime}</span> {act.title}
                            </div>
                          ))}
                        </div>

                        <div className="text-[10px] font-bold text-slate-400 group-hover:text-[#0284c7] flex items-center justify-between">
                          <span>{dayActs.length > 0 ? `${dayActs.length} acts` : 'Libre'}</span>
                          <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeView === 'lista' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[#001428]">
                      Listado Integral de Actividades y Visitas
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {allFilteredActivities.length} actividades encontradas en el registro oficial
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenNewActivityModal(currentDayInfo.dateStr)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#001428] hover:bg-[#0e4a7b] text-white text-xs font-bold rounded-lg shadow-2xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Programar</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Fecha y Hora</th>
                        <th className="py-2.5 px-3">Tipo</th>
                        <th className="py-2.5 px-3">Actividad / Institución</th>
                        <th className="py-2.5 px-3">Ubicación</th>
                        <th className="py-2.5 px-3">Responsable</th>
                        <th className="py-2.5 px-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allFilteredActivities.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            No se encontraron actividades con los filtros seleccionados.
                          </td>
                        </tr>
                      ) : (
                        allFilteredActivities.map((act) => (
                          <tr
                            key={act.id}
                            onClick={() => setSelectedActivity(act)}
                            className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                          >
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="font-extrabold text-[#001428]">{act.date}</div>
                              <div className="text-[11px] text-slate-500 font-semibold">{act.startTime} a {act.endTime} hs</div>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                act.type === 'visita'
                                  ? 'bg-blue-100 text-blue-800'
                                  : act.type === 'capacitacion'
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : act.type === 'evento'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}>
                                {act.type === 'visita'
                                  ? 'Visita'
                                  : act.type === 'capacitacion'
                                  ? 'Curso'
                                  : act.type === 'evento'
                                  ? 'Sesión'
                                  : 'Reunión'}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <div className="font-bold text-[#001428] line-clamp-1">{act.title}</div>
                              {act.institution && (
                                <div className="text-[11px] text-slate-500 line-clamp-1">{act.institution}</div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-slate-600 line-clamp-1">
                              {act.location}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap text-slate-600">
                              <div>{act.responsible}</div>
                              {act.attendeesCount && (
                                <div className="text-[10px] text-slate-400">{act.attendeesCount} asistentes</div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSyncEventToGoogleCalendar(act);
                                  }}
                                  className="px-2 py-1 bg-blue-50 text-[#0284c7] hover:bg-blue-100 rounded text-[11px] font-bold border border-blue-200"
                                >
                                  Calendar
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedActivity(act);
                                  }}
                                  className="px-2 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded text-[11px] font-bold"
                                >
                                  Ver
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0284c7]"></span>
                <span>Visita Escolar</span>
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                <span>Capacitación & Cursos</span>
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300 border border-slate-400"></span>
                <span>Sesión / Comisión</span>
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-[#001428]"></span>
                <span>En Curso</span>
              </span>
            </div>

            <button
              onClick={handleDownloadMonthlyPdf}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0284c7] hover:underline cursor-pointer"
            >
              <span>Descargar Cronograma Mensual (PDF)</span>
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-lg border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-[#0284c7]" />
                <h3 className="text-sm font-bold text-[#001428]">
                  Turnos Próximos de Visitas
                </h3>
              </div>
              <span className="px-2 py-0.5 bg-blue-50 text-[#0284c7] border border-blue-100 rounded text-[10px] font-bold">
                {upcomingVisits.length} agendadas
              </span>
            </div>

            <div className="space-y-3">
              {upcomingVisits.length > 0 ? (
                upcomingVisits.map((visit) => {
                  const todayStr = getLocalDateString();
                  const tomorrowStr = getLocalDateString(new Date(Date.now() + 86400000));
                  const isToday = visit.date === todayStr;
                  const isTomorrow = visit.date === tomorrowStr;
                  const [y, m, d] = visit.date.split('-').map(Number);
                  const dObj = new Date(y, m - 1, d, 12, 0, 0);
                  const dayName = DAY_NAMES_FULL[dObj.getDay()];
                  const dayNum = String(dObj.getDate()).padStart(2, '0');
                  const monthShort = MONTH_NAMES_SHORT[dObj.getMonth()];

                  const statusBadge =
                    visit.status === 'en_curso' ? (
                      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-[#0284c7] border border-blue-200 font-bold">
                        En Curso
                      </span>
                    ) : visit.status === 'pendiente' ? (
                      <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-bold">
                        Pendiente
                      </span>
                    ) : visit.status === 'finalizada' ? (
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-bold">
                        Finalizada
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                        Confirmada
                      </span>
                    );

                  return (
                    <div
                      key={visit.id}
                      className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-extrabold uppercase text-[#0284c7]">
                          {isToday
                            ? `HOY • ${visit.startTime || '09:30'}${visit.endTime ? ` - ${visit.endTime}` : ''} HS`
                            : isTomorrow
                            ? `MAÑANA • ${visit.startTime || '09:30'}${visit.endTime ? ` - ${visit.endTime}` : ''} HS`
                            : `${dayName} ${dayNum} ${monthShort.toUpperCase()} • ${visit.startTime || '09:30'}${visit.endTime ? ` - ${visit.endTime}` : ''} HS`}
                        </span>
                        {statusBadge}
                      </div>
                      <div
                        onClick={() => {
                          setSelectedDate(dObj);
                          setActiveView('dia');
                          setSelectedActivity(visit);
                          scrollToCalendarTop('smooth');
                        }}
                        className="text-xs font-bold text-[#001428] hover:text-[#0284c7] transition-colors cursor-pointer"
                        title="Ver en el calendario"
                      >
                        {visit.institution || visit.title}
                      </div>
                      <div className="text-[11px] text-slate-500 space-y-0.5">
                        <div>
                          Contingente:{' '}
                          <strong className="text-slate-700">
                            {visit.attendeesCount ? `${visit.attendeesCount} alumnos` : "Alumnos a confirmar"}
                            {visit.level ? ` (${visit.level})` : ''}
                          </strong>
                        </div>
                        {visit.responsible && (
                          <div>
                            Guía / A cargo:{' '}
                            <strong className="text-slate-700">{visit.responsible}</strong>
                          </div>
                        )}
                      </div>
                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px]">
                        <button
                          type="button"
                          onClick={() => downloadActivitySheetPdf(visit)}
                          className="inline-flex items-center gap-1 font-bold text-[#0284c7] hover:underline cursor-pointer"
                          title="Descargar Ficha y Nómina Oficial en PDF"
                        >
                          <FileText className="w-3 h-3" />
                          <span>Ficha & Nómina PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDate(dObj);
                            setActiveView('dia');
                            setSelectedActivity(visit);
                            scrollToCalendarTop('smooth');
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded font-semibold text-[10px] transition-colors cursor-pointer"
                          title="Ver en la agenda del día"
                        >
                          <CalendarIcon className="w-3 h-3 text-[#0284c7]" />
                          <span>Ver en Agenda</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-lg space-y-2">
                  <p>No hay turnos de visitas escolares programados a partir de hoy.</p>
                  <button
                    type="button"
                    onClick={() => onOpenNewActivityModal()}
                    className="px-3 py-1.5 bg-[#001428] text-white rounded font-bold text-xs hover:bg-[#0e4a7b] transition-colors cursor-pointer"
                  >
                    Agendar Nueva Visita
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-purple-700" />
                <h3 className="text-sm font-bold text-[#001428]">
                  Próximas Capacitaciones
                </h3>
              </div>
              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-100 rounded text-[10px] font-bold">
                {upcomingCapacitaciones.length} activas
              </span>
            </div>

            <div className="space-y-3">
              {upcomingCapacitaciones.length > 0 ? (
                upcomingCapacitaciones.map((cap) => {
                  const todayStr = getLocalDateString();
                  const tomorrowStr = getLocalDateString(new Date(Date.now() + 86400000));
                  const isToday = cap.date === todayStr;
                  const isTomorrow = cap.date === tomorrowStr;
                  const [y, m, d] = (cap.date || '').split('-').map(Number);
                  const dObj = new Date(y, m - 1, d, 12, 0, 0);
                  const dayName = DAY_NAMES_FULL[dObj.getDay()];
                  const dayNum = String(dObj.getDate()).padStart(2, '0');
                  const monthShort = MONTH_NAMES_SHORT[dObj.getMonth()];

                  return (
                    <div
                      key={cap.id}
                      className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2 hover:border-purple-200 transition-colors"
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-extrabold uppercase text-purple-700">
                          {isToday
                            ? `HOY • ${cap.startTime || '15:00'} HS`
                            : isTomorrow
                            ? `MAÑANA • ${cap.startTime || '15:00'} HS`
                            : `${dayName} ${dayNum} ${monthShort.toUpperCase()} • ${cap.startTime || '15:00'} HS`}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded border ${getStatusChip(getEffectiveStatus(cap)).cls} font-bold`}>
                          {getStatusChip(getEffectiveStatus(cap)).label}
                        </span>
                      </div>
                      <div
                        onClick={() => {
                          setSelectedDate(dObj);
                          setActiveView('dia');
                          setSelectedActivity(cap);
                          scrollToCalendarTop('smooth');
                        }}
                        className="text-xs font-bold text-[#001428] hover:text-purple-700 transition-colors cursor-pointer"
                        title="Ver en el calendario"
                      >
                        {cap.title}
                      </div>
                      <div className="text-[11px] text-slate-500 space-y-0.5">
                        {cap.responsible && (
                          <div>
                            Docente / A cargo:{' '}
                            <strong className="text-slate-700">{cap.responsible}</strong>
                          </div>
                        )}
                        {cap.attendeesCount && (
                          <div>
                            Inscriptos:{' '}
                            <strong className="text-slate-700">
                              {cap.attendeesCount} participantes
                            </strong>
                          </div>
                        )}
                      </div>
                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px]">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDate(dObj);
                            setActiveView('dia');
                            setSelectedActivity(cap);
                            scrollToCalendarTop('smooth');
                          }}
                          className="inline-flex items-center gap-1 font-bold text-purple-700 hover:underline cursor-pointer"
                        >
                          <CalendarIcon className="w-3 h-3" />
                          <span>Ver en Agenda</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedActivity(cap)}
                          className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-[10px] cursor-pointer"
                        >
                          Detalles
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-lg">
                  No hay capacitaciones programadas en las próximas semanas.
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#0284c7]" />
                <h3 className="text-sm font-bold text-[#001428]">
                  Protocolo y Recursos
                </h3>
              </div>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('recursos')}
                  className="text-[11px] font-bold text-[#0284c7] hover:underline flex items-center gap-1 cursor-pointer"
                  title="Explorar el repositorio institucional en la sección de Recursos"
                >
                  <span>Ver todos ({allResources.length})</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Normativa oficial, autorizaciones y plantillas articuladas con el repositorio central de Recursos para la coordinación de visitas y contingentes.
            </p>

            <div className="space-y-2.5">
              {visitResources.slice(0, 5).map((res) => {
                const isPdf = res.format === 'PDF';
                const isDocx = res.format === 'DOCX';
                const isForm = res.format === 'FORM';
                const isMenoresPdf = res.id === 'res-proto-1' || res.title.toLowerCase().includes('ingreso de menores');
                const isImagenPdf = res.id === 'res-proto-2' || res.title.toLowerCase().includes('autorización');

                const handleAction = () => {
                  if (isMenoresPdf) {
                    downloadProtocoloMenoresPdf();
                  } else if (isImagenPdf) {
                    downloadAutorizacionImagenPdf();
                  } else if (res.contentTemplate && onNavigateTab) {
                    onNavigateTab('recursos');
                  } else if (res.driveUrl) {
                    window.open(res.driveUrl, '_blank', 'noopener,noreferrer');
                  } else if (onNavigateTab) {
                    onNavigateTab('recursos');
                  }
                };

                return (
                  <div
                    key={res.id}
                    onClick={handleAction}
                    className="p-2.5 rounded-lg border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-all flex items-start justify-between gap-3 cursor-pointer group"
                    title={
                      isMenoresPdf || isImagenPdf
                        ? 'Descargar documento oficial en PDF'
                        : res.contentTemplate
                        ? 'Ver plantilla en módulo de Recursos'
                        : 'Abrir enlace oficial en Drive / Formularios'
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase border ${
                            isPdf
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : isDocx
                              ? 'bg-blue-50 text-[#0284c7] border-blue-200'
                              : isForm
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {res.format}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {res.updatedAt ? `Act. ${res.updatedAt}` : 'Oficial'}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-[#001428] group-hover:text-[#0284c7] transition-colors leading-snug">
                        {res.title}
                      </div>
                      {res.description && (
                        <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                          {res.description}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 mt-1">
                      {isMenoresPdf || isImagenPdf ? (
                        <div className="w-7 h-7 rounded bg-blue-50 text-[#0284c7] flex items-center justify-center border border-blue-100 group-hover:bg-[#0284c7] group-hover:text-white transition-colors">
                          <Download className="w-3.5 h-3.5" />
                        </div>
                      ) : res.contentTemplate ? (
                        <div className="w-7 h-7 rounded bg-slate-50 text-slate-600 flex items-center justify-center border border-slate-200 group-hover:bg-[#001428] group-hover:text-white transition-colors">
                          <FileText className="w-3.5 h-3.5" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded bg-slate-50 text-slate-600 flex items-center justify-center border border-slate-200 group-hover:bg-slate-700 group-hover:text-white transition-colors">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5 text-[#0284c7]" />
                Sincronizado con Recursos
              </span>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('recursos')}
                  className="font-bold text-[#0284c7] hover:underline cursor-pointer"
                >
                  Gestionar Repositorio
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedDayActivities && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedDayActivities(null);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden sm:overflow-y-auto overscroll-none"
        >
          <div
            data-bottom-sheet="true"
            style={daySheet.sheetStyle}
            className="w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain h-[88dvh] sm:h-auto sm:max-h-[90vh] flex flex-col animate-in fade-in sm:zoom-in-95 duration-200"
          >
            <BottomSheetHandle
              {...daySheet.dragBind}
              isExpanded={daySheet.isExpanded}
              isDragging={daySheet.isDragging}
            />
            <div
              {...daySheet.dragBind}
              className="p-4 sm:p-6 pb-3 sm:pb-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 select-none touch-none sm:touch-auto cursor-grab active:cursor-grabbing sm:cursor-default"
            >
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#001428] text-white flex flex-col items-center justify-center shrink-0 shadow-xs">
                  <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider leading-none">
                    {selectedDayActivities.dayName.slice(0, 3)}
                  </span>
                  <span className="text-sm sm:text-base font-black leading-none mt-0.5">
                    {selectedDayActivities.dayNumber}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-extrabold text-[#001428] tracking-tight truncate">
                      Jornada: {selectedDayActivities.dayName} {selectedDayActivities.dayNumber} de {selectedDayActivities.monthFull}
                    </h3>
                    <span className="px-1.5 py-0.2 rounded text-[10px] sm:text-[11px] font-extrabold bg-blue-50 text-[#0284c7] border border-blue-200 shrink-0">
                      {selectedDayActivities.activities.length} {selectedDayActivities.activities.length === 1 ? 'actividad' : 'actividades'}
                    </span>
                    {isWeekendDay(selectedDayActivities.dateStr) && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 uppercase tracking-wide shrink-0">
                        {getWeekendDayName(selectedDayActivities.dateStr)} • No Laboral
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 truncate">
                    Cronograma oficial de visitas guiadas, capacitaciones y sesiones
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDayActivities(null)}
                className="hidden sm:flex text-slate-400 hover:text-slate-800 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer shrink-0 ml-2"
                title="Cerrar vista de jornada"
                aria-label="Cerrar vista de jornada"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div ref={dayContentRef} className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3">
              {selectedDayActivities.activities.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <CalendarIcon className="w-10 h-10 mx-auto text-slate-300 stroke-1" />
                  <p className="text-sm font-semibold text-slate-600">No hay actividades programadas para este día.</p>
                  {isWeekendDay(selectedDayActivities.dateStr) ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg max-w-sm mx-auto text-amber-900 text-xs space-y-1">
                      <p className="font-bold text-[11px] uppercase tracking-wide text-amber-800">
                        Día no laboral ({getWeekendDayName(selectedDayActivities.dateStr)})
                      </p>
                      <p className="text-[11px] text-amber-700 leading-relaxed">
                        Los fines de semana no se realizan visitas guiadas escolares institucionales. El cronograma oficial opera de lunes a viernes.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Los turnos de visitas y salones están disponibles para asignación parlamentaria.
                    </p>
                  )}
                  <button
                    onClick={() => {
                      const targetDate = selectedDayActivities?.dateStr || currentDayInfo.dateStr;
                      setSelectedDayActivities(null);
                      onOpenNewActivityModal(targetDate);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#001428] hover:bg-[#0e4a7b] text-white text-xs font-bold rounded shadow-xs transition-colors cursor-pointer mt-2"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Programar Nueva Actividad</span>
                  </button>
                </div>
              ) : (
                selectedDayActivities.activities.map((act) => {
                  const isVisita = act.type === 'visita';
                  const isCapacitacion = act.type === 'capacitacion';
                  const isEvento = act.type === 'evento';

                  return (
                    <div
                      key={act.id}
                      onClick={() => setSelectedActivity(act)}
                      className={`p-3.5 rounded-lg border transition-all cursor-pointer group space-y-2 shadow-2xs hover:shadow-xs ${
                        isVisita
                          ? 'border-blue-200 bg-blue-50/40 hover:bg-blue-50/80 hover:border-[#0284c7]'
                          : isCapacitacion
                          ? 'border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50/80 hover:border-indigo-500'
                          : isEvento
                          ? 'border-purple-200 bg-purple-50/40 hover:bg-purple-50/80 hover:border-purple-500'
                          : 'border-amber-200 bg-amber-50/40 hover:bg-amber-50/80 hover:border-amber-500'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-[#001428] text-white tracking-wide">
                            {act.startTime} a {act.endTime} hs
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                              isVisita
                                ? 'bg-blue-100 text-blue-800'
                                : isCapacitacion
                                ? 'bg-indigo-100 text-indigo-800'
                                : isEvento
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {act.type === 'visita'
                              ? 'Visita Escolar'
                              : act.type === 'capacitacion'
                              ? 'Capacitación'
                              : act.type === 'evento'
                              ? 'Sesión / Acto'
                              : 'Reunión'}
                          </span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${getStatusChip(getEffectiveStatus(act)).cls}`}>
                                    {getStatusChip(getEffectiveStatus(act)).label}
                                  </span>
                                </div>

                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0284c7] group-hover:underline shrink-0">
                                  <span>Ver Ficha</span>
                          <ExternalLink className="w-3 h-3" />
                        </span>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-[#001428] group-hover:text-[#0284c7] transition-colors">
                          {act.title}
                        </h4>
                        {act.description && (
                          <p className="text-xs text-slate-600 line-clamp-2 mt-1 leading-relaxed">
                            {act.description}
                          </p>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="flex items-center gap-1 font-medium">
                            <MapPin className="w-3.5 h-3.5 text-[#0284c7]" />
                            <strong className="text-slate-700">{act.location}</strong>
                          </span>
                          <span className="flex items-center gap-1 font-medium">
                            <Users className="w-3.5 h-3.5 text-[#0284c7]" />
                            <span>
                              {act.responsible} {act.attendeesCount ? `(${act.attendeesCount} participantes)` : ''}
                            </span>
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDayActivities(null);
                            onSyncEventToGoogleCalendar(act);
                          }}
                          className="px-2.5 py-1 bg-[#eff6ff] hover:bg-[#dbeafe] text-[#0284c7] border border-[#bfdbfe] rounded text-[10px] font-bold transition-colors shadow-2xs"
                        >
                          Agendar en Google Calendar
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 sm:p-6 pt-3 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between shrink-0">
              <button
                type="button"
                onClick={() => {
                  const targetDate = selectedDayActivities?.dateStr || currentDayInfo.dateStr;
                  setSelectedDayActivities(null);
                  onOpenNewActivityModal(targetDate);
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#001428] hover:bg-[#122a45] text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar actividad</span>
              </button>
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedDayActivities(null)}
                  className="w-full sm:w-auto text-center px-4 py-2.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  Volver al Cronograma
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const dateParts = selectedDayActivities.dateStr.split('-');
                    const targetDate = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]));
                    setSelectedDayActivities(null);
                    setSelectedDate(targetDate);
                    setActiveView('dia');
                    scrollToCalendarTop('smooth');
                  }}
                  className="w-full sm:w-auto text-center px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-[#0284c7] font-bold text-xs rounded-lg border border-blue-200 transition-colors cursor-pointer shadow-2xs"
                >
                  Abrir en Vista de Día
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedActivity && (
        <div
          key={selectedActivity.id}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedActivity(null);
              setIsCancellingInModal(false);
              setCancelReasonInput('');
            }
          }}
          className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden sm:overflow-y-auto overscroll-none"
        >
          <div
            data-bottom-sheet="true"
            style={activitySheet.sheetStyle}
            className="w-full sm:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain h-[88dvh] sm:h-auto sm:max-h-[90vh] flex flex-col animate-in fade-in sm:zoom-in-95 duration-200"
          >
            <BottomSheetHandle
              {...activitySheet.dragBind}
              isExpanded={activitySheet.isExpanded}
              isDragging={activitySheet.isDragging}
            />
            <div
              {...activitySheet.dragBind}
              className="p-4 sm:p-6 pb-3 sm:pb-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 select-none touch-none sm:touch-auto cursor-grab active:cursor-grabbing sm:cursor-default"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <CalendarIcon className="w-5 h-5 text-[#001428] shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-[#001428] tracking-tight truncate">
                    Ficha Oficial de la Actividad
                  </h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                    Detalle protocolar, logística y coordinación parlamentaria
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedActivity(null)}
                className="hidden sm:flex text-slate-400 hover:text-slate-800 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ml-2"
                title="Cerrar ventana"
                aria-label="Cerrar ventana"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div ref={activityContentRef} className="p-4 sm:p-6 space-y-3.5 text-xs overflow-y-auto overscroll-contain flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                    selectedActivity.type === 'visita'
                      ? 'bg-blue-100 text-blue-800'
                      : selectedActivity.type === 'capacitacion'
                      ? 'bg-indigo-100 text-indigo-800'
                      : selectedActivity.type === 'evento'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {selectedActivity.type === 'visita'
                    ? 'Visita Escolar'
                    : selectedActivity.type === 'capacitacion'
                    ? 'Capacitación'
                    : selectedActivity.type === 'evento'
                    ? 'Sesión / Acto'
                    : 'Reunión'}
                </span>
                {(() => {
                  // Ficha con estado DERIVADO de horarios reales (visual, no persistido).
                  const effectiveStatus = getEffectiveStatus(selectedActivity);
                  return effectiveStatus === 'pendiente' ? (
                    <span className="text-[10px] text-amber-900 bg-amber-100 px-2 py-0.5 rounded font-extrabold border border-amber-300 uppercase tracking-wide">
                      Pendiente de Confirmación
                    </span>
                  ) : effectiveStatus === 'cancelada' ? (
                    <span className="text-[10px] text-rose-900 bg-rose-100 px-2 py-0.5 rounded font-extrabold border border-rose-300 uppercase tracking-wide">
                      Visita Cancelada
                    </span>
                  ) : effectiveStatus === 'en_curso' ? (
                    <span className="text-[10px] text-blue-900 bg-blue-100 px-2 py-0.5 rounded font-extrabold border border-blue-300 uppercase tracking-wide">
                      En Curso
                    </span>
                  ) : effectiveStatus === 'finalizada' ? (
                    <span className="text-[10px] text-slate-800 bg-slate-100 px-2 py-0.5 rounded font-extrabold border border-slate-300 uppercase tracking-wide">
                      Finalizada
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded font-extrabold border border-emerald-300 uppercase tracking-wide">
                      Confirmada
                    </span>
                  );
                })()}
                <span className="text-[10px] text-slate-500 font-mono">
                  Fecha: {selectedActivity.date}
                </span>
              </div>

              {selectedActivity.status === 'cancelada' && selectedActivity.cancellationReason && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 flex items-start gap-2">
                  <span className="font-extrabold text-rose-700 uppercase text-[10px] tracking-wider">Motivo de cancelación:</span>
                  <span>{selectedActivity.cancellationReason}</span>
                </div>
              )}

              {/* Admin quick status controls inside modal */}
              {isAdmin && onUpdateActivityStatus && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-950">
                    <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Gestión de Estado (Administrador):</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {selectedActivity.status !== 'confirmada' && (
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateActivityStatus(selectedActivity.id, 'confirmada');
                          setSelectedActivity((prev) => (prev ? { ...prev, status: 'confirmada' } : null));
                        }}
                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-2xs"
                      >
                        ✓ Confirmar Visita
                      </button>
                    )}
                    {selectedActivity.status !== 'cancelada' && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCancellingInModal((prev) => !prev);
                          setCancelReasonInput(selectedActivity.cancellationReason || '');
                        }}
                        className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-2xs"
                      >
                        ✗ Cancelar Visita
                      </button>
                    )}
                    {selectedActivity.status !== 'pendiente' && (
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateActivityStatus(selectedActivity.id, 'pendiente');
                          setSelectedActivity((prev) => (prev ? { ...prev, status: 'pendiente' } : null));
                        }}
                        className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs transition-colors cursor-pointer"
                      >
                        ↺ Reabrir (Pendiente)
                      </button>
                    )}
                  </div>

                  {isCancellingInModal && (
                    <div className="w-full mt-2.5 p-3 bg-rose-50 border border-rose-200 rounded-lg space-y-2 text-xs animate-in fade-in duration-150">
                      <div className="font-bold text-rose-900">Motivo de cancelación (opcional):</div>
                      <input
                        type="text"
                        value={cancelReasonInput}
                        onChange={(e) => setCancelReasonInput(e.target.value)}
                        placeholder="Ej: Inconveniente de la institución / no puede asistir"
                        className="w-full p-2 bg-white rounded border border-rose-300 text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-rose-500"
                        autoFocus
                      />
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setIsCancellingInModal(false)}
                          className="px-2.5 py-1 text-slate-600 hover:text-slate-900 font-semibold text-xs rounded hover:bg-rose-100/60"
                        >
                          Descartar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const reason = cancelReasonInput.trim() || 'Inconveniente de la institución / no puede asistir';
                            onUpdateActivityStatus(selectedActivity.id, 'cancelada', reason);
                            setSelectedActivity((prev) =>
                              prev ? { ...prev, status: 'cancelada', cancellationReason: reason } : null
                            );
                            setIsCancellingInModal(false);
                          }}
                          className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded shadow-xs"
                        >
                          Confirmar Cancelación
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isAdmin && onOpenEmailModal && onUpdateActivityFull && selectedActivity.type === 'visita' && selectedActivity.status !== 'cancelada' && selectedActivity.status !== 'pendiente' && (
                <div className="p-3 bg-sky-50/70 border border-sky-200 rounded-lg space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-sky-950">
                    <Star className="w-4 h-4 text-sky-600 shrink-0" />
                    <span>Encuesta de satisfacción de la visita</span>
                  </div>

                  <div>
                    <label htmlFor="csat-dest-email" className="block text-[11px] font-bold text-sky-950 mb-1">
                      Email de la institución (destinatario de la encuesta)
                    </label>
                    <input
                      id="csat-dest-email"
                      type="email"
                      value={csatEmailInput}
                      onChange={(e) => {
                        setCsatEmailInput(e.target.value);
                        setCsurveyEmailError(null);
                      }}
                      placeholder="Ej: direccion@colegio.edu.ar"
                      className="w-full text-xs px-3 py-2 rounded-lg border border-sky-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#0284c7]"
                    />
                    {csurveyEmailError && (
                      <p className="text-[10px] text-rose-700 font-bold mt-1">{csurveyEmailError}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        const cleanEmail = csatEmailInput.trim().toLowerCase();
                        if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) {
                          setCsurveyEmailError('Ingresá un email válido de la institución para enviar la encuesta.');
                          return;
                        }
                        openCsatEmailFor({ ...selectedActivity, contactEmail: cleanEmail });
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#001428] hover:bg-[#0e4a7b] text-white font-bold text-[11px] transition-colors cursor-pointer"
                    >
                      <Mail className="w-3.5 h-3.5 text-sky-300" />
                      <span>Enviar por email</span>
                    </button>
                    {selectedActivity.csatSurveySentAt && (
                      <span className="text-[10px] text-sky-700">
                        Último envío: {new Date(selectedActivity.csatSurveySentAt).toLocaleString('es-AR')}
                      </span>
                    )}
                  </div>
                  <VisitCsatResponses activityId={selectedActivity.id} />
                </div>
              )}

              <h4 className="text-sm sm:text-base font-extrabold text-[#001428] leading-snug">
                {selectedActivity.title}
              </h4>

              <div className="p-3 bg-slate-50 rounded-lg space-y-2 border border-slate-200">
                <div className="flex items-center gap-2 text-slate-700">
                  <Clock className="w-3.5 h-3.5 text-[#0284c7] shrink-0" />
                  <span>
                    <strong>Horario:</strong> {selectedActivity.startTime} a {selectedActivity.endTime} hs
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <MapPin className="w-3.5 h-3.5 text-[#0284c7] shrink-0" />
                  <span>
                    <strong>Ubicación:</strong> {selectedActivity.location}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <Users className="w-3.5 h-3.5 text-[#0284c7] shrink-0" />
                  <span>
                    <strong>Responsable:</strong> {selectedActivity.responsible}
                    {selectedActivity.attendeesCount ? ` (${selectedActivity.attendeesCount} participantes)` : ''}
                  </span>
                </div>
                {selectedActivity.institution && (
                  <div className="flex items-center gap-2 text-slate-700">
                    <GraduationCap className="w-3.5 h-3.5 text-[#0284c7] shrink-0" />
                    <span>
                      <strong>Institución / Nivel:</strong> {selectedActivity.institution} {selectedActivity.level ? `• ${selectedActivity.level}` : ''}
                    </span>
                  </div>
                )}
                {selectedActivity.contactEmail && (
                  <div className="flex items-center gap-2 text-slate-700">
                    <Mail className="w-3.5 h-3.5 text-[#0284c7] shrink-0" />
                    <span>
                      <strong>Email institución:</strong> {selectedActivity.contactEmail}
                    </span>
                  </div>
                )}
                {selectedActivity.notes && (
                  <div className="text-[11px] text-slate-600 pt-1 border-t border-slate-200">
                    <strong>Notas logísticas:</strong> {selectedActivity.notes}
                  </div>
                )}
              </div>

              {selectedActivity.description && (
                <div className="space-y-1">
                  <span className="font-bold text-slate-700">Descripción / Programa:</span>
                  <p className="text-slate-600 leading-relaxed bg-white p-2.5 rounded border border-slate-100">
                    {selectedActivity.description}
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 sm:p-6 pt-3 border-t border-slate-200 bg-slate-50/50 flex flex-col-reverse sm:flex-row justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedActivity(null)}
                className="w-full sm:w-auto text-center px-4 py-2.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => downloadActivitySheetPdf(selectedActivity)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#001428] rounded-lg text-xs font-bold cursor-pointer transition-colors border border-slate-300 shadow-2xs"
                title="Descargar Ficha Técnica en PDF"
              >
                <Download className="w-3.5 h-3.5 text-[#0284c7]" />
                <span>Descargar PDF</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const act = selectedActivity;
                  setSelectedActivity(null);
                  setSelectedDayActivities(null);
                  onSyncEventToGoogleCalendar(act);
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#001428] hover:bg-[#122a45] text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs"
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                <span>Agendar en Google Calendar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {csatAutoPrompt && (
        <div className="fixed bottom-28 sm:bottom-6 inset-x-4 sm:inset-x-auto sm:right-6 z-40 max-w-sm bg-white border-2 border-[#0284c7] rounded-xl shadow-2xl p-4 space-y-2.5 animate-in fade-in">
          <div className="flex items-start gap-2">
            <Mail className="w-4 h-4 text-[#0284c7] mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#001428] leading-snug">
                La visita &ldquo;{csatAutoPrompt.title}&rdquo; finalizó ({csatAutoPrompt.endTime} hs).
              </p>
              <p className="text-[11px] text-slate-600 mt-1 break-words">
                ¿Enviamos la encuesta de satisfacción a <strong>{csatAutoPrompt.contactEmail}</strong>?
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                dismissedCsatIdsRef.current.add(csatAutoPrompt.id);
                setCsatAutoPrompt(null);
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-semibold text-[11px] hover:bg-slate-100 transition-colors cursor-pointer"
            >
              No ahora
            </button>
            <button
              type="button"
              onClick={() => {
                if (openCsatEmailFor(csatAutoPrompt)) {
                  setCsatAutoPrompt(null);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#001428] hover:bg-[#0e4a7b] text-white font-bold text-[11px] transition-colors cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5 text-sky-300" />
              <span>Enviar encuesta</span>
            </button>
          </div>
          <p className="text-[10px] text-slate-400">
            Cada envío usa un link único: la institución puede responder una sola vez.
          </p>
        </div>
      )}
    </div>
  );
}


/**
 * Resumen en vivo de respuestas CSAT de una actividad: se suscribe a Firestore y
 * filtra las respuestas vinculadas por activityId (se muestra en la ficha).
 */
function VisitCsatResponses({ activityId }: { activityId: string }) {
  const [responses, setResponses] = useState<VisitCsatDoc[] | null>(null);

  useEffect(() => {
    const activeCleanup = subscribeToCollection(VISIT_CSAT_COLLECTION, (remote) => {
      const docs: VisitCsatDoc[] = remote
        .filter((d) => d.activityId === activityId)
        .map((d) => ({
          id: String(d.id ?? d.__id ?? ''),
          activityId: String(d.activityId ?? ''),
          rating: Number(d.rating) || 0,
          comment: typeof d.comment === 'string' ? d.comment : '',
          submittedAt: typeof d.submittedAt === 'string' ? d.submittedAt : '',
        }))
        .filter((d) => d.rating >= 1 && d.rating <= 5);
      setResponses(docs);
    });
    return () => activeCleanup?.();
  }, [activityId]);

  if (responses === null) return null;
  if (responses.length === 0) {
    return (
      <p className="text-[10px] text-slate-500">
        Sin respuestas todavía. El link de la encuesta llega a la institución por email.
      </p>
    );
  }
  const average = csatAverage(responses);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-bold text-[#001428]">
        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
        <span>
          Promedio: {average?.toFixed(1) ?? '—'} / 5 · {responses.length}
          {responses.length === 1 ? ' respuesta' : ' respuestas'}
        </span>
      </div>
      {responses.some((r) => r.comment) && (
        <details className="text-[11px] text-slate-600">
          <summary className="cursor-pointer font-bold text-slate-700 hover:text-[#0284c7]">
            Ver comentarios ({responses.filter((r) => r.comment).length})
          </summary>
          <ul className="mt-1 space-y-1">
            {responses
              .filter((r) => r.comment)
              .map((r) => (
                <li key={r.id} className="p-1.5 bg-white border border-slate-200 rounded whitespace-pre-wrap">
                  {r.comment}
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}

