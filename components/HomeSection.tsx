'use client';

import React, { useState } from 'react';
import {
  Calendar,
  GraduationCap,
  FileText,
  MapPin,
  ArrowRight,
  PlusCircle,
  FolderOpen,
  FileCheck,
  Building2,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  Megaphone,
  BarChart3,
  Eye,
  Shield,
  User,
  Users,
  Layers,
  FileSpreadsheet,
  Palette,
  CalendarCheck,
  X,
  Cake,
  Target,
  CheckCircle2,
  Mail,
  Globe,
  Pencil,
  Trash2,
} from 'lucide-react';
import { ActivityItem, NewsItem, QuickLink, TeamMember, TrainingCourse, AgentCourseAudit } from '@/lib/mock-data';
import { getLocalDateString, formatDateDisplay, getBirthdayCountdown, getShortWeekdayEs, getInstitutionalTodayParts } from '@/lib/utils';
import { ConfirmationModal } from '@/components/ConfirmationModal';

/** Máximo de comunicados visibles en Inicio: 5 en la semana corriente; 6 si hay avisos con fecha posterior a la semana. */
const NEWS_HOME_LIMIT_SAME_WEEK = 5;
const NEWS_HOME_LIMIT_WITH_FUTURE = 6;

/**
 * Convierte la fecha de un comunicado (se ingresa como texto es-AR: "13 oct 2026",
 * "13 de oct. de 2026", o ISO YYYY-MM-DD) a "YYYY-MM-DD" comparable. null si no parsea.
 */
const NEWS_MONTH_HINTS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function parseNewsDateToYmd(raw?: string): string | null {
  const text = (raw || '').trim();
  if (!text) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = /^(\d{1,2})\s+(?:de\s+)?([a-záé]{3,12})\.?(?:\s+de\s+)?(\d{4})\.?$/i.exec(text);
  if (!m) return null;
  const day = Number(m[1]);
  // "set" (setiembre rioplatense) equivale a "sep".
  const monthHint = m[2].toLowerCase().slice(0, 3) === 'set' ? 'sep' : m[2].toLowerCase().slice(0, 3);
  const monthIdx = NEWS_MONTH_HINTS.indexOf(monthHint);
  if (monthIdx < 0 || !Number.isInteger(day) || day < 1 || day > 31) return null;
  return `${m[3]}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
import { getInstitutionalSettings, DEFAULT_SETTINGS, type InstitutionalSettings, type MetricGoalSettings, getCourseCsatStats, getCourseAudits } from '@/lib/storage';
import { useBottomSheetDrag } from '@/lib/useBottomSheetDrag';
import { BottomSheetHandle } from '@/components/BottomSheetHandle';

interface HomeSectionProps {
  activities: ActivityItem[];
  news: NewsItem[];
  courses?: TrainingCourse[];
  quickLinks: QuickLink[];
  team?: TeamMember[];
  onNavigateTab: (tab: string) => void;
  onNavigateToAgendaDate?: (dateStr: string, view?: 'dia' | 'semana' | 'mes' | 'lista') => void;
  onOpenQuickAction: (action: 'visita' | 'actividad' | 'novedad') => void;
  onSyncEventToCalendar: (activity: ActivityItem) => void;
  /** Edita un comunicado existente (admin). */
  onSaveNews?: (item: NewsItem) => void;
  /** Elimina definitivamente un comunicado (admin). */
  onDeleteNews?: (id: string) => void;
  hasCalendarAuth: boolean;
  isAdmin?: boolean;
}

function getLinkIconData(type?: string) {
  switch (type) {
    case 'drive':
      return { Icon: FolderOpen, color: 'text-amber-600', bg: 'bg-amber-50' };
    case 'sheets':
      return { Icon: FileSpreadsheet, color: 'text-emerald-600', bg: 'bg-emerald-50' };
    case 'forms':
      return { Icon: FileCheck, color: 'text-purple-600', bg: 'bg-purple-50' };
    case 'calendar':
      return { Icon: Calendar, color: 'text-[#0284c7]', bg: 'bg-blue-50' };
    case 'gmail':
      return { Icon: Mail, color: 'text-rose-600', bg: 'bg-rose-50' };
    case 'canva':
      return { Icon: Palette, color: 'text-indigo-600', bg: 'bg-indigo-50' };
    default:
      return { Icon: Globe, color: 'text-slate-600', bg: 'bg-slate-100' };
  }
}

export function HomeSection({
  activities,
  news,
  courses = [],
  quickLinks,
  team = [],
  onNavigateTab,
  onNavigateToAgendaDate,
  onOpenQuickAction,
  onSyncEventToCalendar,
  onSaveNews,
  onDeleteNews,
  isAdmin = false,
}: HomeSectionProps) {
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [instSettings, setInstSettings] = useState<InstitutionalSettings>(DEFAULT_SETTINGS);
  const [courseAuditsState, setCourseAuditsState] = useState<AgentCourseAudit[]>([]);

  /** Edición de comunicado (admin): item en edición + campos del formulario. */
  const [editingNews, setEditingNews] = useState<NewsItem | null>(null);
  const [newsToDelete, setNewsToDelete] = useState<NewsItem | null>(null);

  React.useEffect(() => {
    setInstSettings(getInstitutionalSettings());
    setCourseAuditsState(getCourseAudits());

    const handleStorageChange = () => {
      setInstSettings(getInstitutionalSettings());
      setCourseAuditsState(getCourseAudits());
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const newsSheet = useBottomSheetDrag({
    isOpen: Boolean(selectedNews),
    onClose: () => setSelectedNews(null),
  });

  React.useEffect(() => {
    if (!selectedNews) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedNews(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNews]);

  const todayStr = getLocalDateString();

  const todayActivities = activities.filter((a) => a.date === todayStr);
  const displayActivities = todayActivities.length > 0
    ? todayActivities.slice(0, 3)
    : activities.filter((a) => a.date >= todayStr).slice(0, 3);

  const activeActivities = displayActivities.length > 0 ? displayActivities : activities.slice(0, 3);

  const upcomingBirthdays = React.useMemo(() => {
    return team
      .map((member) => ({
        member,
        countdown: getBirthdayCountdown(member.birthday),
      }))
      .filter(({ countdown }) => countdown !== null && countdown.isWithin5Days);
  }, [team]);

  const metrics = React.useMemo(() => {
    const goalSettings: MetricGoalSettings = instSettings.metricGoal || {
      period: 'anual',
      metricType: 'agentes',
      targetAgentes: 1750,
      targetVisitas: 35,
    };

    const isShowingVisitas = goalSettings.metricType === 'visitas';
    const isMensual = goalSettings.period === 'mensual';

    const { year: currentYear, month: currentMonthIndex } = getInstitutionalTodayParts();
    const currentMonthPrefix = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}`;
    const currentYearPrefix = `${currentYear}-`;

    const MONTH_NAMES = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const currentPeriodLabel = isMensual ? MONTH_NAMES[currentMonthIndex] : `${currentYear}`;

    // 1. Filtrado de Visitas Escolares estrictamente según el período seleccionado
    const periodVisits = activities.filter((a) => {
      if (a.type !== 'visita') return false;
      return isMensual ? a.date.startsWith(currentMonthPrefix) : a.date.startsWith(currentYearPrefix);
    });

    const confirmedVisits = periodVisits.filter(
      (a) => a.status === 'confirmada' || a.status === 'en_curso' || a.status === 'finalizada'
    );
    const pendingVisits = periodVisits.filter((a) => a.status === 'pendiente');
    const cancelledVisits = periodVisits.filter((a) => a.status === 'cancelada');

    const visitasConfirmadasCount = confirmedVisits.length;
    const visitasCount = visitasConfirmadasCount;
    const totalVisitasConvocadas = periodVisits.length;
    const alumnosRecibidos = confirmedVisits.reduce((sum, a) => sum + (a.attendeesCount || 0), 0);

    // 2. Filtrado y cómputo de Agentes Formados según el período y estado de homologación de auditorías
    // A. Capacitaciones presenciales de la agenda en el período
    const periodCapacitaciones = activities.filter((a) => {
      if (a.type !== 'capacitacion' || a.status === 'cancelada') return false;
      return isMensual ? a.date.startsWith(currentMonthPrefix) : a.date.startsWith(currentYearPrefix);
    });
    const capacitacionAttendees = periodCapacitaciones.reduce((sum, a) => sum + (a.attendeesCount || 0), 0);

    // B. Cursos auditados y HOMOLOGADOS por Administración (aprobado_admin) en el período
    // Si un agente no fue aprobado, fue observado o se le reseteó/eliminó la cursada, NO suma.
    const approvedAudits = courseAuditsState.filter((audit) => {
      if (audit.isSample) return false; // ejemplos de demostración: no suman a métricas reales
      if (audit.auditStatus !== 'aprobado_admin' && !audit.certifiedAt) return false;
      
      const auditDate = audit.lastCheckTimestamp ? new Date(audit.lastCheckTimestamp) : new Date();
      if (isMensual) {
        return auditDate.getFullYear() === currentYear && auditDate.getMonth() === currentMonthIndex;
      } else {
        return auditDate.getFullYear() === currentYear;
      }
    });
    const approvedAuditsCount = approvedAudits.length;

    // C. Agentes formados = SOLO conteo real:
    // asistentes a capacitaciones presenciales cargadas en el período + agents digitales
    // que completaron y fueron homologados por Administración (aprobado_admin).
    // Sin bases históricas de prueba: la métrica arranca en 0 con datos reales.
    const agentesFormados = capacitacionAttendees + approvedAuditsCount;

    // 3. Índice CSAT Oficial
    const csatData = getCourseCsatStats();
    // Sin encuestas todavía no hay índice: se muestra "—" en lugar de un porcentaje inventado.
    const satisfaccionPct: number | null = csatData.hasData ? csatData.csatPercentage : null;

    // 4. Cálculo de Metas del Administrador
    const currentTarget = isShowingVisitas ? goalSettings.targetVisitas : goalSettings.targetAgentes;
    const currentValue = isShowingVisitas ? visitasCount : agentesFormados;
    const objetivoPct = Math.min(100, Math.round((currentValue / Math.max(1, currentTarget)) * 100));

    return {
      agentesFormados,
      visitasCount,
      visitasConfirmadasCount,
      visitasPendientesCount: pendingVisits.length,
      visitasCanceladasCount: cancelledVisits.length,
      totalVisitasConvocadas,
      alumnosRecibidos,
      satisfaccionPct,
      objetivoPct,
      goalSettings,
      currentTarget,
      currentValue,
      isShowingVisitas,
      isMensual,
      currentPeriodLabel,
      currentYear,
    };
  }, [activities, instSettings.metricGoal, courseAuditsState]);

  // Próximas actividades 100% correlativas con la agenda institucional
  const upcomingEvents = React.useMemo(() => {
    return activities
      .filter((a) => (a.date || '') >= todayStr)
      .sort(
        (a, b) =>
          (a.date || '').localeCompare(b.date || '') ||
          (a.startTime || '').localeCompare(b.startTime || '')
      )
      .slice(0, 4);
  }, [activities, todayStr]);

  // Ventana de la semana corriente (lunes a domingo, zona institucional).
  const weekBounds = React.useMemo(() => {
    const { year, month, day } = getInstitutionalTodayParts();
    const today = new Date(year, month, day, 12, 0, 0);
    const dow = today.getDay();
    const offsetToMonday = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(today);
    monday.setDate(today.getDate() + offsetToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const toYmd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { mondayYmd: toYmd(monday), sundayYmd: toYmd(sunday) };
  }, []);

  // El aviso interno toma estrictamente el comunicado asignado por el admin (isAnnouncement === true)
  // o en su defecto el primer comunicado relevante si está activo en Datos Institucionales.
  const activeAnnouncementNews = news.find((n) => n.isAnnouncement) || news.find((n) => n.pinned) || news[0];
  const shouldShowInternalNotice = instSettings.isAnnouncementActive && Boolean(activeAnnouncementNews);

  const sortedNews = React.useMemo(() => {
    return [...news].sort((a, b) => {
      if (a.isAnnouncement && !b.isAnnouncement) return -1;
      if (!a.isAnnouncement && b.isAnnouncement) return 1;
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      // Más nuevos primero por fecha real (mmmm parsing es-AR); sin fecha → al final.
      const aYmd = parseNewsDateToYmd(a.date) || '0000-00-00';
      const bYmd = parseNewsDateToYmd(b.date) || '0000-00-00';
      if (aYmd !== bYmd) return bYmd.localeCompare(aYmd);
      return b.id.localeCompare(a.id);
    });
  }, [news]);

  // Límite visible en Inicio: 5 en la semana corriente; 6 si entre los primeros comunicados
  // hay alguno con fecha posterior a la semana (avisos que venzan más adelante).
  const visibleNews = React.useMemo(() => {
    if (sortedNews.length <= NEWS_HOME_LIMIT_SAME_WEEK) return sortedNews;
    const hasPostWeekNews = sortedNews
      .slice(0, NEWS_HOME_LIMIT_WITH_FUTURE)
      .some((n) => {
        const ymd = parseNewsDateToYmd(n.date);
        return Boolean(ymd) && Boolean(weekBounds.sundayYmd) && ymd! > weekBounds.sundayYmd;
      });
    return sortedNews.slice(0, hasPostWeekNews ? NEWS_HOME_LIMIT_WITH_FUTURE : NEWS_HOME_LIMIT_SAME_WEEK);
  }, [sortedNews, weekBounds]);
  const hiddenNewsCount = news.length - visibleNews.length;

  return (
    <div className="space-y-6">
      {/* Aviso Interno (Circulado en Verde) - Controlado por el interruptor y el comunicado asignado */}
      {shouldShowInternalNotice && activeAnnouncementNews && (
        <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-lg px-4 py-2.5 flex items-center justify-between text-xs text-[#1e40af] shadow-2xs">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
              activeAnnouncementNews.category === 'Urgente' ? 'bg-rose-600 text-white animate-pulse' : 'bg-[#1e40af] text-white'
            }`}>
              <Megaphone className="w-3 h-3" />
            </div>
            <span className="truncate">
              <strong className={`font-extrabold tracking-wide uppercase mr-1.5 ${
                activeAnnouncementNews.category === 'Urgente' ? 'text-rose-700' : 'text-[#1e3a8a]'
              }`}>
                {activeAnnouncementNews.category === 'Urgente' ? 'AVISO URGENTE :' : 'AVISO INTERNO :'}
              </strong>
              <span
                onClick={() => setSelectedNews(activeAnnouncementNews)}
                className="hover:underline cursor-pointer font-medium"
              >
                {activeAnnouncementNews.title}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-3">
            <button
              onClick={() => setSelectedNews(activeAnnouncementNews)}
              className="text-[#001428] hover:text-[#0284c7] font-bold text-[11px] underline cursor-pointer hidden sm:inline"
            >
              Leer comunicado
            </button>
            <button
              onClick={() => onNavigateTab('recursos')}
              className="text-[#0284c7] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Ver resoluciones</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <section className="bg-white rounded-lg border border-slate-200 p-6 sm:p-7 shadow-xs relative">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#eff6ff] text-[#0284c7] text-[11px] font-bold border border-[#bfdbfe]">
              <Building2 className="w-3 h-3 text-[#0284c7]" />
              <span className="uppercase tracking-wider">INSTITUTO DE CAPACITACIÓN Y GESTIÓN PÚBLICA</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#001428] tracking-tight">
              Portal del Equipo Legislativo
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-3xl leading-relaxed">
              Gestión formativa interna, coordinación pedagógica de visitas ciudadanas e instrumentos operativos del Poder Legislativo.
            </p>
          </div>

          <div className="shrink-0 self-start lg:self-center">
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <div className="text-left leading-tight">
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                  SERVICIOS OPERATIVOS
                </div>
                <div className="text-xs font-bold text-slate-800">
                  Campus y Sede Habilitados
                </div>
              </div>
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
              Acciones Frecuentes y Trámites Rápidos
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <button
                onClick={() => onOpenQuickAction('visita')}
                className="p-3.5 rounded-lg bg-[#0e4a7b] hover:bg-[#0b3c64] text-white text-left transition-all shadow-2xs flex items-center gap-3 cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-md bg-white/15 flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition-transform">
                  <GraduationCap className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white leading-tight">Nueva Visita</div>
                  <div className="text-[10px] text-blue-200 font-medium">Solicitud escolar</div>
                </div>
              </button>

              <button
                onClick={() => onOpenQuickAction('actividad')}
                className="p-3.5 rounded-lg bg-[#19385c] hover:bg-[#122a45] text-white text-left transition-all shadow-2xs flex items-center gap-3 cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-md bg-white/15 flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition-transform">
                  <FileText className="w-4 h-4 text-emerald-300" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white leading-tight">Registrar Actividad</div>
                  <div className="text-[10px] text-slate-300 font-medium">Carga pedagógica</div>
                </div>
              </button>

              <button
                onClick={() => onNavigateTab('agenda')}
                className="p-3.5 rounded-lg bg-[#eff6ff] hover:bg-[#dbeafe] border border-[#dbeafe] text-left transition-all shadow-2xs flex items-center gap-3 cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-md bg-blue-100 flex items-center justify-center text-[#0284c7] shrink-0 group-hover:scale-105 transition-transform">
                  <Calendar className="w-4 h-4 text-[#0284c7]" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#001428] leading-tight">Agenda Completa</div>
                  <div className="text-[10px] text-slate-500 font-medium">Cronograma institucional</div>
                </div>
              </button>

              <button
                onClick={() => onNavigateTab('recursos')}
                className="p-3.5 rounded-lg bg-[#eff6ff] hover:bg-[#dbeafe] border border-[#dbeafe] text-left transition-all shadow-2xs flex items-center gap-3 cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-md bg-blue-100 flex items-center justify-center text-[#0284c7] shrink-0 group-hover:scale-105 transition-transform">
                  <FolderOpen className="w-4 h-4 text-[#0284c7]" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#001428] leading-tight">Documentos</div>
                  <div className="text-[10px] text-slate-500 font-medium">Notas & Membretes</div>
                </div>
              </button>

              <button
                onClick={() => onNavigateTab('recursos')}
                className="p-3.5 rounded-lg bg-[#eff6ff] hover:bg-[#dbeafe] border border-[#dbeafe] text-left transition-all shadow-2xs flex items-center gap-3 cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-md bg-blue-100 flex items-center justify-center text-[#0284c7] shrink-0 group-hover:scale-105 transition-transform">
                  <FileCheck className="w-4 h-4 text-[#0284c7]" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#001428] leading-tight">Formularios</div>
                  <div className="text-[10px] text-slate-500 font-medium">Encuestas y Altas</div>
                </div>
              </button>
            </div>
          </div>
        )}
      </section>

      {upcomingBirthdays.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-amber-500/10 border border-amber-300 rounded-lg p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
              <Cake className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="text-xs font-extrabold text-[#001428] flex items-center gap-2">
                <span>¡Cumpleaños próximo en el equipo!</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500 text-white uppercase">
                  Próximos 5 días
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                {upcomingBirthdays.map(({ member, countdown }) => (
                  <span key={member.id} className="mr-2">
                    <strong>{member.name}</strong> ({member.birthday}) - {countdown?.daysLeft === 0 ? '¡Es hoy!' : countdown?.daysLeft === 1 ? '¡Es mañana!' : `en ${countdown?.daysLeft} días`}
                  </span>
                ))}
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('equipo')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#001428] hover:bg-[#0e4a7b] text-white text-xs font-bold rounded shadow-2xs transition-colors cursor-pointer shrink-0"
          >
            <span>Ver Directorio & Saludar</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3.5 sm:p-6 space-y-3.5 sm:space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 min-w-0">
                <Calendar className="w-4 h-4 text-[#0284c7] shrink-0" />
                <h2 className="text-sm sm:text-base font-bold text-[#001428] truncate">
                  {todayActivities.length > 0 ? 'Hoy en el Instituto' : 'Próximas Actividades en el Instituto'}
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 uppercase tracking-wider shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                  EN VIVO
                </span>
              </div>
              <button
                onClick={() => onNavigateTab('agenda')}
                className="inline-flex items-center gap-1 text-xs text-[#0284c7] hover:text-[#002d5a] font-semibold transition-colors cursor-pointer self-start sm:self-auto"
              >
                <span>{activeActivities.length} {activeActivities.length === 1 ? 'actividad programada' : 'actividades programadas'}</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#0284c7]" />
              </button>
            </div>

            {activeActivities.length === 0 ? (
              <div className="py-8 px-4 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50 space-y-1.5">
                <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-1" />
                <p className="text-xs font-semibold text-slate-700">No hay actividades programadas para hoy</p>
                <p className="text-[11px] text-slate-500">Puedes consultar la agenda institucional o registrar una nueva visita.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeActivities.map((act) => {
                  const isToday = act.date === todayStr;
                  return (
                    <div
                      key={act.id}
                      className="p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors space-y-2.5 shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className="px-2 py-0.5 rounded bg-[#002d5a] text-white font-mono text-[11px] font-bold shrink-0">
                            {act.startTime} HS
                          </span>
                          {isToday ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 uppercase tracking-wider shrink-0">
                              {act.status === 'en_curso' ? 'EN CURSO' : 'HOY'}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200 uppercase tracking-wider shrink-0">
                              {formatDateDisplay(act.date)}
                            </span>
                          )}
                          {act.status === 'pendiente' && (
                            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 text-[10px] font-extrabold border border-amber-300 uppercase tracking-wider shrink-0">
                              PENDIENTE
                            </span>
                          )}
                          {act.status === 'cancelada' && (
                            <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-800 text-[10px] font-extrabold border border-rose-300 uppercase tracking-wider shrink-0">
                              CANCELADA
                            </span>
                          )}
                          {act.status === 'confirmada' && !isToday && (
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-300 uppercase tracking-wider shrink-0">
                              CONFIRMADA
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded bg-sky-50 text-[#0284c7] text-[10px] font-bold border border-sky-200 uppercase tracking-wider shrink-0">
                            {act.type === 'visita' ? (
                              <>
                                <span className="sm:hidden">VISITAS</span>
                                <span className="hidden sm:inline">VISITAS GUIADAS</span>
                              </>
                            ) : act.type === 'capacitacion' ? (
                              <>
                                <span className="sm:hidden">CURSO</span>
                                <span className="hidden sm:inline">FORMACIÓN CONTINUA</span>
                              </>
                            ) : act.type === 'evento' ? (
                              <>
                                <span className="sm:hidden">ACTO</span>
                                <span className="hidden sm:inline">ACTO INSTITUCIONAL</span>
                              </>
                            ) : (
                              'GESTIÓN'
                            )}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onSyncEventToCalendar(act)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-[#0284c7] hover:text-[#002d5a] bg-sky-50/90 hover:bg-sky-100 border border-sky-200 rounded-md transition-colors cursor-pointer shrink-0 shadow-2xs"
                          title="Agendar en Google Calendar"
                        >
                          <CalendarCheck className="w-3.5 h-3.5 text-[#0284c7]" />
                          <span>Agendar</span>
                        </button>
                      </div>

                      <h3 className="text-sm sm:text-base font-bold text-[#001428] leading-snug">
                        {act.title}
                      </h3>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {act.description}
                      </p>
                      <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-1.5 sm:gap-3 text-[11px] text-slate-600">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">
                            Resp: <strong className="text-slate-800 font-semibold">{act.responsible}</strong>
                          </span>
                        </div>

                        <div className="hidden sm:inline-block text-slate-300" aria-hidden="true">•</div>

                        <div className="flex items-center gap-1.5 min-w-0">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{act.location}</span>
                        </div>

                        {act.attendeesCount ? (
                          <>
                            <div className="hidden sm:inline-block text-slate-300" aria-hidden="true">•</div>
                            <div className="flex items-center gap-1.5 shrink-0 text-slate-500">
                              <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{act.attendeesCount} Participantes</span>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div id="seccion-novedades" className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#0284c7]" />
                <h2 className="text-sm sm:text-base font-bold text-[#001428]">
                  Novedades y Comunicados Internos
                </h2>
                <span className="text-[11px] font-semibold text-slate-500">
                  ({visibleNews.length}
                  {hiddenNewsCount > 0 ? ` de ${news.length} publicados` : ''})
                </span>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenQuickAction('novedad')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#001428] hover:bg-[#0e4a7b] text-white text-xs font-bold rounded-lg shadow-2xs transition-colors cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Publicar Comunicado</span>
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {visibleNews.map((item) => {
                if (item.imageUrl) {
                  return (
                    <div
                      key={item.id}
                      className="border border-slate-200 rounded-lg overflow-hidden bg-white hover:border-slate-300 transition-colors shadow-2xs"
                    >
                      <div className="flex flex-col sm:flex-row">
                        <div className="relative sm:w-2/5 min-h-[170px] sm:min-h-[190px] bg-slate-100 shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover absolute inset-0"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = '/legislative_seminar.jpg';
                            }}
                          />
                          <div className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-[#001428] text-white text-[10px] font-extrabold uppercase tracking-wider rounded shadow-xs">
                            {item.category}
                          </div>
                        </div>

                        <div className="p-4 sm:p-5 sm:w-3/5 space-y-2 flex flex-col justify-between">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>Publicado: {item.date} • {item.author}</span>
                            </div>
                            <h3
                              onClick={() => setSelectedNews(item)}
                              className="text-sm sm:text-base font-bold text-[#001428] hover:text-[#0284c7] leading-tight cursor-pointer transition-colors"
                            >
                              {item.title}
                            </h3>
                            <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                              {item.summary}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 pt-2 flex-wrap">
                            <button
                              onClick={() => setSelectedNews(item)}
                              className="px-3.5 py-1.5 bg-[#001428] hover:bg-[#0e4a7b] text-white text-xs font-semibold rounded shadow-2xs transition-colors cursor-pointer"
                            >
                              Ver Detalle & Comunicado
                            </button>
                            <button
                              onClick={() => onNavigateTab('recursos')}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded transition-colors cursor-pointer"
                            >
                              Descargar Resolución
                            </button>
                            {isAdmin && (onSaveNews || onDeleteNews) && (
                              <div className="ml-auto flex items-center gap-1">
                                <NewsAdminActions
                                  onEdit={() => setEditingNews(item)}
                                  onDelete={() => setNewsToDelete(item)}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors flex items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-md bg-blue-50 text-[#0284c7] flex items-center justify-center shrink-0 border border-blue-100 mt-0.5">
                        {item.category === 'Urgente' ? (
                          <AlertCircle className="w-4 h-4 text-rose-600" />
                        ) : item.category === 'Institucional' ? (
                          <Shield className="w-4 h-4 text-[#0284c7]" />
                        ) : item.category === 'Capacitación' ? (
                          <GraduationCap className="w-4 h-4 text-[#0284c7]" />
                        ) : (
                          <FileText className="w-4 h-4 text-[#0284c7]" />
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#0284c7]">
                          {item.category} <span className="text-slate-400 font-normal lowercase">• {item.date}</span>
                        </div>
                        <h4
                          onClick={() => setSelectedNews(item)}
                          className="text-xs sm:text-sm font-bold text-[#001428] hover:text-[#0284c7] cursor-pointer leading-tight transition-colors"
                        >
                          {item.title}
                        </h4>
                        <p className="text-[11px] text-slate-600 line-clamp-1 leading-normal">
                          {item.summary}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setSelectedNews(item)}
                        className="text-slate-400 hover:text-slate-700 p-1.5 rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
                        title="Leer noticia completa"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {isAdmin && (onSaveNews || onDeleteNews) && (
                        <NewsAdminActions
                          onEdit={() => setEditingNews(item)}
                          onDelete={() => setNewsToDelete(item)}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#0a1c30] text-white rounded-lg p-5 shadow-xs space-y-4 border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="uppercase tracking-wider font-extrabold text-[10px] text-sky-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                GESTIÓN {new Date().getFullYear()} • EN VIVO
              </span>
              <BarChart3 className="w-4 h-4 text-sky-400" />
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white tracking-tight">
                {metrics.isMensual ? `Métricas del Mes (${metrics.currentPeriodLabel})` : `Métricas del Año (${metrics.currentYear})`}
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-semibold border border-slate-700">
                Auditado
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-slate-800">
              <div
                className={`p-2 rounded transition-colors ${
                  !metrics.isShowingVisitas ? 'bg-slate-800/80 ring-1 ring-sky-400/40' : 'bg-slate-900/40'
                }`}
              >
                <div className="text-xl sm:text-2xl font-black text-white leading-tight">
                  {metrics.agentesFormados.toLocaleString('es-AR')}
                </div>
                <div className="text-[10px] text-slate-300 font-medium mt-0.5">Agentes formados</div>
              </div>

              <div
                className={`p-2 border-x border-slate-800 rounded transition-colors ${
                  metrics.isShowingVisitas ? 'bg-slate-800/80 ring-1 ring-sky-400/40' : 'bg-slate-900/40'
                }`}
              >
                <div suppressHydrationWarning className="text-xl sm:text-2xl font-black text-white leading-tight">
                  {metrics.visitasConfirmadasCount}
                </div>
                <div className="text-[10px] text-slate-300 font-medium mt-0.5">
                  Visitas confirmadas
                </div>
                <div className="text-[9px] text-sky-300 font-semibold mt-0.5">
                  {metrics.visitasPendientesCount > 0 ? (
                    <span className="text-amber-300">+{metrics.visitasPendientesCount} pend. • </span>
                  ) : null}
                  {metrics.alumnosRecibidos.toLocaleString('es-AR')} alumnos
                </div>
              </div>

              <div className="p-2 bg-slate-900/40 rounded" title="Índice CSAT: satisfacción de egresados de capacitaciones y trayectos formativos">
                <div className="text-xl sm:text-2xl font-black text-sky-400 leading-tight">
                  {metrics.satisfaccionPct === null ? '—' : `${metrics.satisfaccionPct}%`}
                </div>
                <div className="text-[10px] text-slate-300 font-medium mt-0.5">Satisfacción CSAT</div>
              </div>
            </div>

            {/* Barra de Carga Institucional (Configurada exclusivamente por el Administrador en el Panel) */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="font-bold text-white">
                    Meta {metrics.isMensual ? `Mensual (${metrics.currentPeriodLabel})` : `Anual (${metrics.currentYear})`}:{' '}
                    <span className="text-sky-300 font-extrabold">
                      {metrics.isShowingVisitas ? 'Visitas Escolares' : 'Agentes Formados'}
                    </span>
                  </span>
                </div>
                <span className="text-[10px] font-extrabold text-sky-300 bg-sky-950/90 px-2 py-0.5 rounded-full border border-sky-800/80">
                  {metrics.objetivoPct}% cumplido
                </span>
              </div>

              {/* Progress Bar & Details */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] text-slate-300">
                  <span>
                    Objetivo fijado:{' '}
                    <strong className="text-white">
                      {metrics.currentTarget.toLocaleString('es-AR')}{' '}
                      {metrics.isShowingVisitas ? 'visitas escolares' : 'agentes'}
                    </strong>
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    Registrado: <strong className="text-white">{metrics.currentValue.toLocaleString('es-AR')}</strong>
                  </span>
                </div>

                <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-700/60">
                  <div
                    className="bg-sky-400 h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${metrics.objetivoPct}%`,
                    }}
                  ></div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>
                    {metrics.isShowingVisitas
                      ? `${metrics.visitasConfirmadasCount} visitas confirmadas • ${metrics.alumnosRecibidos.toLocaleString('es-AR')} alumnos recibidos`
                      : `${metrics.agentesFormados.toLocaleString('es-AR')} agentes capacitados ${metrics.isMensual ? 'en el mes' : 'en el ciclo anual'}`}
                  </span>
                  {metrics.isShowingVisitas && metrics.visitasPendientesCount > 0 ? (
                    <span className="text-amber-300 font-semibold">
                      +{metrics.visitasPendientesCount} por confirmar
                    </span>
                  ) : (
                    <span className="text-slate-400 font-medium">
                      Período {metrics.isMensual ? `Mensual (${metrics.currentPeriodLabel})` : `Anual ${metrics.currentYear}`}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#0284c7]" />
                <h3 className="text-sm font-bold text-[#001428]">
                  Próximos Días
                </h3>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">
                Cronograma
              </span>
            </div>

            <div className="space-y-2.5">
              {upcomingEvents.length > 0 ? (
                upcomingEvents.map((event) => {
                  const parts = event.date.split('-');
                  const dayName = getShortWeekdayEs(event.date);
                  const dayNum = parts[2];
                  const isVisita = event.type === 'visita';
                  const isCap = event.type === 'capacitacion';

                  return (
                    <div
                      key={event.id}
                      onClick={() => {
                        if (onNavigateToAgendaDate) {
                          onNavigateToAgendaDate(event.date, 'dia');
                        } else {
                          onNavigateTab('agenda');
                        }
                      }}
                      className="flex items-start gap-3 p-2.5 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50/40 transition-all cursor-pointer group"
                      title="Haga clic para ver el cronograma de este día en la Agenda"
                    >
                      <div className="w-11 py-2 bg-[#eff6ff] text-[#0284c7] group-hover:bg-[#001428] group-hover:text-white rounded-lg text-center shrink-0 border border-[#bfdbfe] group-hover:border-[#001428] transition-colors shadow-2xs">
                        <div className="text-[9px] font-extrabold uppercase leading-none">{dayName}</div>
                        <div className="text-sm font-black leading-tight mt-0.5">{dayNum}</div>
                      </div>
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase tracking-wider ${
                            isVisita
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : isCap
                              ? 'bg-blue-50 text-[#0284c7] border border-blue-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            {isVisita ? 'Visita Escolar' : isCap ? 'Capacitación' : 'Actividad'}
                          </span>
                          {event.status === 'pendiente' && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase bg-amber-500 text-white tracking-wider">
                              Pendiente
                            </span>
                          )}
                          {event.status === 'cancelada' && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase bg-rose-500 text-white tracking-wider">
                              Cancelada
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 font-mono font-semibold">
                            {event.startTime} hs
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-[#001428] group-hover:text-[#0284c7] transition-colors leading-tight line-clamp-1">
                          {event.title}
                        </h4>
                        <p className="text-[10px] text-slate-500 line-clamp-1 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{event.location}</span>
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-[#0284c7] group-hover:translate-x-0.5 transition-all self-center shrink-0" />
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs text-slate-400 space-y-2 bg-slate-50 rounded-lg border border-slate-100">
                  <p>No hay actividades programadas para los próximos días.</p>
                  <button
                    type="button"
                    onClick={() => onOpenQuickAction('actividad')}
                    className="inline-flex items-center gap-1 text-[#0284c7] font-bold hover:underline"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Programar actividad</span>
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                if (onNavigateToAgendaDate) {
                  onNavigateToAgendaDate(todayStr, 'mes');
                } else {
                  onNavigateTab('agenda');
                }
              }}
              className="w-full py-2 bg-[#eff6ff] hover:bg-[#dbeafe] text-[#0284c7] text-xs font-bold rounded-lg text-center transition-colors cursor-pointer border border-[#bfdbfe]"
            >
              Ver Calendario Mensual Completo
            </button>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#0284c7]" />
                <h3 className="text-sm font-bold text-[#001428]">
                  Ecosistema Operativo
                </h3>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Accesos directos autorizados
              </p>
            </div>

            <div className="space-y-2">
              {quickLinks && quickLinks.length > 0 ? (
                quickLinks.slice(0, 4).map((link) => {
                  const { Icon, color, bg } = getLinkIconData(link.iconType);
                  return (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all group"
                      title={`Abrir ${link.title} (${link.category})`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                        <div className={`w-7 h-7 rounded-lg ${bg} ${color} flex items-center justify-center shrink-0`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-[#001428] group-hover:text-[#0284c7] transition-colors truncate">
                            {link.title}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {link.description || link.category}
                          </div>
                        </div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#0284c7] transition-colors shrink-0" />
                    </a>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-slate-100">
                  No hay accesos directos configurados en la sección Enlaces.
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab('enlaces')}
              className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-[#001428] text-xs font-bold rounded-lg text-center transition-colors cursor-pointer border border-slate-200 flex items-center justify-center gap-1.5"
            >
              <span>Ver Todos los Enlaces ({quickLinks?.length || 0})</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>
      </div>

      {selectedNews && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedNews(null);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden sm:overflow-y-auto overscroll-none"
        >
          <div
            data-bottom-sheet="true"
            style={newsSheet.sheetStyle}
            className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain h-[88dvh] sm:h-auto sm:max-h-[90vh] flex flex-col animate-in fade-in sm:zoom-in-95 duration-200"
          >
            <BottomSheetHandle
              {...newsSheet.dragBind}
              isExpanded={newsSheet.isExpanded}
              isDragging={newsSheet.isDragging}
            />
            <div
              {...newsSheet.dragBind}
              className="p-4 sm:p-6 pb-3 sm:pb-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 select-none touch-none sm:touch-auto cursor-grab active:cursor-grabbing sm:cursor-default"
            >
              <div className="flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-[#001428]" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#0284c7] bg-[#eff6ff] border border-[#bfdbfe] px-2.5 py-0.5 rounded-full">
                  {selectedNews.category}
                </span>
              </div>
              <button
                onClick={() => setSelectedNews(null)}
                className="hidden sm:flex text-slate-400 hover:text-slate-800 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer"
                title="Cerrar ventana"
                aria-label="Cerrar ventana"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-3 overflow-y-auto flex-1">
              {selectedNews.imageUrl && (
                <div className="relative w-full h-44 sm:h-56 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedNews.imageUrl}
                    alt={selectedNews.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/legislative_seminar.jpg';
                    }}
                  />
                  <div className="absolute top-2.5 left-2.5 px-2.5 py-0.5 bg-[#001428] text-white text-[10px] font-extrabold uppercase tracking-wider rounded shadow-xs">
                    {selectedNews.category}
                  </div>
                </div>
              )}
              <div className="text-xs text-slate-400">{selectedNews.date} • {selectedNews.author}</div>
              <h3 className="text-sm sm:text-base font-bold text-[#001428] leading-snug">
                {selectedNews.title}
              </h3>
              <p className="text-xs text-slate-700 leading-relaxed font-medium">
                {selectedNews.summary}
              </p>
              <div className="pt-2 border-t border-slate-100 text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                {selectedNews.content}
              </div>
            </div>
            <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-white flex justify-end shrink-0">
              <button
                onClick={() => setSelectedNews(null)}
                className="w-full sm:w-auto text-center px-4 py-2.5 bg-[#001428] hover:bg-[#0e4a7b] text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de edición de comunicado (admin) — key por id: se monta limpio por comunicado */}
      {editingNews && (
        <NewsEditModal
          key={editingNews.id}
          item={editingNews}
          onClose={() => setEditingNews(null)}
          onSave={(updated) => onSaveNews?.(updated)}
        />
      )}

      {/* Confirmación de eliminación de comunicado (admin) */}
      <ConfirmationModal
        isOpen={Boolean(newsToDelete)}
        title="Eliminar Comunicado"
        description={`¿Estás seguro de que deseas eliminar definitivamente el comunicado "${newsToDelete?.title || ''}"? Desaparecerá para todos los integrantes y no se puede deshacer.`}
        confirmLabel="Eliminar comunicado"
        cancelLabel="Volver"
        isDestructive={true}
        itemDetails={newsToDelete ? [
          { label: 'Título', value: newsToDelete.title },
          { label: 'Fecha', value: newsToDelete.date },
          { label: 'Categoría', value: newsToDelete.category },
        ] : []}
        onConfirm={() => {
          if (newsToDelete) {
            onDeleteNews?.(newsToDelete.id);
            if (selectedNews?.id === newsToDelete.id) setSelectedNews(null);
          }
          setNewsToDelete(null);
        }}
        onCancel={() => setNewsToDelete(null)}
      />
    </div>
  );
}

/**
 * Modal de edición de comunicado (admin): mismos campos que el alta, conservando la
 * fecha original de publicación (editar no refecha el aviso).
 */
function NewsEditModal({
  item,
  onClose,
  onSave,
}: {
  item: NewsItem;
  onClose: () => void;
  onSave: (updated: NewsItem) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [category, setCategory] = useState(item.category);
  const [author, setAuthor] = useState(item.author);
  const [summary, setSummary] = useState(item.summary);
  const [content, setContent] = useState(item.content);
  const [imageUrl, setImageUrl] = useState(item.imageUrl || '');
  const [pinned, setPinned] = useState(Boolean(item.pinned));
  const [isAnnouncement, setIsAnnouncement] = useState(Boolean(item.isAnnouncement));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !summary.trim()) {
      setErrorMsg('El título y el resumen son obligatorios.');
      return;
    }
    onSave({
      ...item,
      title: title.trim(),
      category,
      author: author.trim() || 'Instituto de Capacitación Legislativa',
      summary: summary.trim(),
      content: content.trim() || summary.trim(),
      imageUrl: imageUrl.trim() || undefined,
      pinned,
      isAnnouncement,
    });
    onClose();
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="news-edit-title"
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto"
    >
      <form
        onSubmit={handleSave}
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg p-5 sm:p-6 space-y-3.5"
      >
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
          <h3 id="news-edit-title" className="text-sm font-bold text-[#001428]">
            Editar Comunicado
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label htmlFor="ne-title" className="block text-[11px] font-bold text-[#001428] mb-1">Título *</label>
          <input
            id="ne-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="ne-category" className="block text-[11px] font-bold text-[#001428] mb-1">Categoría</label>
            <select
              id="ne-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as NewsItem['category'])}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none bg-white"
            >
              {(['Institucional', 'Urgente', 'Capacitación', 'Programas', 'Novedad'] as const).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ne-author" className="block text-[11px] font-bold text-[#001428] mb-1">Autor / Área</label>
            <input
              id="ne-author"
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label htmlFor="ne-summary" className="block text-[11px] font-bold text-[#001428] mb-1">Resumen *</label>
          <textarea
            id="ne-summary"
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none resize-none"
          />
        </div>

        <div>
          <label htmlFor="ne-content" className="block text-[11px] font-bold text-[#001428] mb-1">Contenido completo</label>
          <textarea
            id="ne-content"
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none resize-none"
          />
        </div>

        <div>
          <label htmlFor="ne-image" className="block text-[11px] font-bold text-[#001428] mb-1">URL de imagen (opcional)</label>
          <input
            id="ne-image"
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <label className="flex items-center gap-2 text-xs text-slate-700 font-semibold cursor-pointer">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="accent-[#0284c7]" />
            <span>Fijar arriba (prioritario)</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-700 font-semibold cursor-pointer">
            <input type="checkbox" checked={isAnnouncement} onChange={(e) => setIsAnnouncement(e.target.checked)} className="accent-[#0284c7]" />
            <span>Es el Aviso Interno activo</span>
          </label>
        </div>

        {errorMsg && (
          <p className="text-[11px] text-rose-700 font-bold">{errorMsg}</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-[#001428] hover:bg-[#122a45] text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
          >
            Guardar cambios
          </button>
        </div>
      </form>
    </div>
  );
}

/** Botonera admin por comunicado: editar + eliminar (solo administradores). */
function NewsAdminActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={onEdit}
        title="Editar comunicado"
        aria-label="Editar comunicado"
        className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:text-[#0284c7] hover:border-[#0284c7] transition-colors cursor-pointer"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="Eliminar comunicado"
        aria-label="Eliminar comunicado"
        className="p-1.5 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
