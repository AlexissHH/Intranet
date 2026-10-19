'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  initAuth,
  logout,
  getAccessToken,
  getStoredAccessToken,
  storeAccessToken,
  getAuthorizedUsers,
  isStoredTokenExpired,
  touchSession,
  isSessionExpired,
  isMasterAdminEmail,
  type UserProfile,
} from '@/lib/auth';
import {
  createCalendarEvent,
  createGoogleSheet,
  DEFAULT_SHEET_TAB_TITLE,
  appendRowsToSheet,
  WorkspaceAuthError,
  type CalendarEventPayload,
} from '@/lib/workspace';
import {
  FIRESTORE_DIAGNOSIS_EVENT,
  FIRESTORE_ERROR_EVENT,
  FIRESTORE_READY_EVENT,
} from '@/lib/firestore';
import {
  getActivities,
  initSharedBackend,
  saveActivity,
  deleteActivity,
  getNews,
  saveNews,
  deleteNews,
  setAnnouncementNewsId,
  getCourses,
  saveCourse,
  getPrograms,
  saveProgram,
  getResources,
  saveResource,
  deleteResource,
  getQuickLinks,
  saveQuickLink,
  deleteQuickLink,
  getTeam,
  saveTeamMember,
  deleteTeamMember,
  updateActivityStatus,
  getInstitutionalSettings,
  DEFAULT_SETTINGS,
  type InstitutionalSettings,
} from '@/lib/storage';
import {
  ActivityItem,
  NewsItem,
  TrainingCourse,
  ProjectProgram,
  ResourceDocument,
  QuickLink,
  TeamMember,
} from '@/lib/mock-data';
import { getLocalDateString, getBirthdayCountdown, buildSafeIsoDateTime, exportActivitiesToCsv } from '@/lib/utils';

import { Header } from '@/components/Header';
import { WorkspaceBanner } from '@/components/WorkspaceBanner';
import { HomeSection } from '@/components/HomeSection';
import { RestrictedAccessView } from '@/components/RestrictedAccessView';
import { InstituteSection } from '@/components/InstituteSection';
import { TrainingSection } from '@/components/TrainingSection';
import { ProgramsSection } from '@/components/ProgramsSection';
import { AgendaSection } from '@/components/AgendaSection';
import { ResourcesSection } from '@/components/ResourcesSection';
import { TeamSection } from '@/components/TeamSection';
import { LinksSection } from '@/components/LinksSection';
import { AdminSection } from '@/components/AdminSection';
import { QuickActionsModal } from '@/components/QuickActionsModal';
import { GeminiAssistantModal } from '@/components/GeminiAssistantModal';
import { GmailComposerModal } from '@/components/GmailComposerModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { BackupModal } from '@/components/BackupModal';
import { LoginModal } from '@/components/LoginModal';
import { UserManagementModal } from '@/components/UserManagementModal';
import { LegislaturaLogo } from '@/components/LegislaturaLogo';
import { Database, CheckCircle2, AlertCircle, ExternalLink, BellRing, X } from 'lucide-react';

/**
 * Interruptor del asistente de IA (Gemini). Apagado por defecto: se enciende con
 * NEXT_PUBLIC_AI_ASSISTANT_ENABLED=true en Vercel (además de GEMINI_API_KEY y la política AI_*).
 * Con el interruptor apagado no se muestra ningún botón que lo invoque.
 */
const AI_ASSISTANT_ENABLED = process.env.NEXT_PUBLIC_AI_ASSISTANT_ENABLED === 'true';

const DEFAULT_EVENT_LOCATION = 'Honorable Legislatura de Tucumán';
/** Duración por defecto (1 h 45 min) cuando una actividad no trae una hora de fin válida. */
const DEFAULT_EVENT_DURATION_MS = 105 * 60 * 1000;

/** Convierte una actividad de la agenda en el evento que se crea en Google Calendar. */
function buildActivityCalendarEvent(act: ActivityItem): CalendarEventPayload {
  const startIso = buildSafeIsoDateTime(act.date, act.startTime);
  let endIso = buildSafeIsoDateTime(act.date, act.endTime, 11);
  const startMs = new Date(startIso).getTime();
  if (new Date(endIso).getTime() <= startMs) {
    endIso = new Date(startMs + DEFAULT_EVENT_DURATION_MS).toISOString();
  }
  return {
    summary: act.title,
    description: `${act.description || ''}\n\nResponsable: ${act.responsible || 'Coordinación'}\nUbicación: ${act.location || DEFAULT_EVENT_LOCATION}`,
    location: act.location || DEFAULT_EVENT_LOCATION,
    startDateTime: startIso,
    endDateTime: endIso,
  };
}

/**
 * Evento anual de cumpleaños. Por privacidad NO se vuelcan en el calendario el teléfono, el email
 * ni el domicilio del integrante: un evento de Calendar puede compartirse con terceros.
 */
function buildBirthdayCalendarEvent(member: TeamMember, nextDateStr: string): CalendarEventPayload {
  return {
    summary: `Cumpleaños de ${member.name}`,
    description: `Cumpleaños de ${member.name} (${member.role})\nInstituto de Capacitación Legislativa`,
    location: DEFAULT_EVENT_LOCATION,
    startDate: nextDateStr,
    recurrence: ['RRULE:FREQ=YEARLY'],
  };
}

function isGoogleAuthError(err: any): boolean {
  return (
    err instanceof WorkspaceAuthError ||
    err?.message?.includes('invalid authentication credentials') ||
    err?.status === 401
  );
}

export default function IntranetApp() {
  const [activeTab, setActiveTab] = useState<string>('inicio');
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [agendaTargetDate, setAgendaTargetDate] = useState<Date | undefined>(undefined);
  const [agendaTargetView, setAgendaTargetView] = useState<'dia' | 'semana' | 'mes' | 'lista' | undefined>(undefined);
  const [adminTargetSubTab, setAdminTargetSubTab] = useState<
    'visitas' | 'objetivos' | 'auditoria_cursos' | 'cards_instituto' | 'institucional' | 'usuarios' | 'contenidos' | 'mantenimiento' | undefined
  >(undefined);

  // Estado inicial vacío (sin datos de prueba); se completa con reloadData desde el storage.
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [programs, setPrograms] = useState<ProjectProgram[]>([]);
  const [resources, setResources] = useState<ResourceDocument[]>([]);
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [instSettings, setInstSettings] = useState<InstitutionalSettings>(DEFAULT_SETTINGS);

  const [user, setUser] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoggingIn] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  // true cuando el login se abre para conectar Google Workspace (Calendar/Sheets/Gmail): el
  // formulario viene con esos permisos ya tildados en lugar de obligar a recordarlo.
  const [loginWorkspaceIntent, setLoginWorkspaceIntent] = useState(false);
  const openLogin = useCallback((workspace = false) => {
    setLoginWorkspaceIntent(workspace);
    setIsLoginModalOpen(true);
  }, []);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);

  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [quickActionInitial, setQuickActionInitial] = useState<'visita' | 'actividad' | 'novedad'>('visita');
  const [quickActionInitialDate, setQuickActionInitialDate] = useState<string | undefined>(undefined);
  const pendingCalendarSyncRef = React.useRef<ActivityItem | null>(null);

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiMode, setAiMode] = useState<'fast' | 'general' | 'thinking'>('fast');

  const [isGmailModalOpen, setIsGmailModalOpen] = useState(false);
  const [gmailRecipient, setGmailRecipient] = useState('');
  const [gmailSubject, setGmailSubject] = useState('');
  const [gmailBody, setGmailBody] = useState('');

  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string; link?: { url: string; label: string } } | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Un solo temporizador: antes, el timeout de un aviso anterior cerraba antes de tiempo al nuevo.
  const showToast = useCallback(
    (type: 'success' | 'error', message: string, link?: { url: string; label: string }) => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast({ type, message, link });
      toastTimerRef.current = setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, 5000);
    },
    []
  );
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Estado del backend compartido (Firestore): avisa al usuario si no sincroniza o si quedó conectado.
  useEffect(() => {
    const handleFirestoreError = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      const base = detail?.message || 'Error de comunicación con la base de datos compartida.';
      // Diagnóstico con la sesión ACTUAL para diferenciar "falta publicar reglas"
      // de "la cuenta no tiene permisos de admin".
      let hint = '';
      if (base.includes('bloqueó')) {
        const email = user?.email?.toLowerCase() ?? '';
        if (user?.provider === 'institucional') {
          hint = ' Ingresaste SIN Google (modo institucional): Firestore exige sesión de Google; usá "Continuar con Google".';
        } else if (!email) {
          hint = ' Además: no hay sesión iniciada con Google.';
        } else {
          const record = getAuthorizedUsers().find((u) => u.email.toLowerCase() === email);
          const isAdminNow =
            isMasterAdminEmail(email) ||
            (record?.role === 'administrador' && record?.status === 'aprobado');
          hint = isAdminNow
            ? ` Tu sesión (${email}) sí es administrador: casi seguro las reglas de firestore.rules no están publicadas aún en la consola de Firebase.`
            : ` Tu sesión (${email}) NO figura como administrador aprobado: iniciá sesión con una cuenta maestra o pedí tu aprobación a un admin.`;
        }
      }
      showToast('error', base + hint);
    };
    const handleFirestoreReady = () => {
      showToast('success', 'Sincronización con la base de datos compartida de Firebase activa.');
    };
    // Auto-diagnóstico que corre al loguear un admin: una sola conclusión puntual.
    const handleFirestoreDiagnosis = (e: Event) => {
      const lines = (e as CustomEvent<{ lines?: string[] }>).detail?.lines ?? [];
      const text = lines.join(' ').slice(0, 380);
      if (!text) return;
      showToast(text.includes('Escritura OK') ? 'success' : 'error', text);
    };
    window.addEventListener(FIRESTORE_ERROR_EVENT, handleFirestoreError);
    window.addEventListener(FIRESTORE_READY_EVENT, handleFirestoreReady);
    window.addEventListener(FIRESTORE_DIAGNOSIS_EVENT, handleFirestoreDiagnosis);
    return () => {
      window.removeEventListener(FIRESTORE_ERROR_EVENT, handleFirestoreError);
      window.removeEventListener(FIRESTORE_READY_EVENT, handleFirestoreReady);
      window.removeEventListener(FIRESTORE_DIAGNOSIS_EVENT, handleFirestoreDiagnosis);
    };
  }, [showToast, user]);

  const checkAdminPermission = (actionName: string): boolean => {
    if (!user) {
      openLogin();
      showToast('error', `Para ${actionName} debes iniciar sesión como Administrador.`);
      return false;
    }
    if (user.role !== 'administrador') {
      showToast('error', `Acceso denegado: "${actionName}" requiere permisos de Administrador. Tu cuenta es de Visitante / Integrante del Equipo (solo lectura).`);
      return false;
    }
    return true;
  };

  const [confirmationState, setConfirmationState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    details?: { label: string; value: string }[];
    isDestructive?: boolean;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);

  const reloadData = useCallback(() => {
    initSharedBackend();
    setActivities(getActivities());
    setNews(getNews());
    setCourses(getCourses());
    setPrograms(getPrograms());
    setResources(getResources());
    setQuickLinks(getQuickLinks());
    setTeam(getTeam());
    setInstSettings(getInstitutionalSettings());
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      reloadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [reloadData]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      // e.key === null: se vació todo el localStorage desde otra pestaña.
      if (!e.key || e.key.startsWith('icl_intranet_')) {
        reloadData();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [reloadData]);

  useEffect(() => {
    const unsubscribe = initAuth(
      (profile, token) => {
        setUser(profile);
        setAccessToken(token);
        const count = getAuthorizedUsers().filter((u) => u.status === 'pendiente').length;
        setPendingApprovalsCount(count);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setPendingApprovalsCount(0);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleLogout = useCallback(async (silent = false) => {
    await logout();
    setUser(null);
    setAccessToken(null);
    setActiveTab('inicio');
    if (!silent) {
      showToast('success', 'Sesión cerrada correctamente.');
    }
  }, [showToast]);

  // Proactive Session & Token Watchdog: maintains persistent session health in localStorage
  // and guarantees immediate, clean closure upon expiration (preventing zombie states)
  useEffect(() => {
    const evaluateSessionHealth = async () => {
      // 1. If not logged in, nothing to evaluate
      if (!user) return;

      // 2. Check if the session has exceeded its persistent retention limit
      if (isSessionExpired()) {
        await handleLogout(true);
        showToast(
          'error',
          'Tu sesión ha expirado por límite de tiempo de inactividad. Se ha cerrado de forma segura para proteger la información institucional.'
        );
        return;
      }

      // 3. The window is ONLY slid on real user activity (handleUserActivity below): if the
      // watchdog slid it every 15 s, the "expires after inactivity" limit could never trigger.
      // 4. Keep token fresh and synchronized
      if (accessToken && isStoredTokenExpired()) {
        setAccessToken(null);
        storeAccessToken(null);
      } else if (!accessToken) {
        const stored = getStoredAccessToken();
        if (stored) {
          setAccessToken(stored);
        }
      }
    };

    const handleUserActivity = () => {
      if (user) {
        touchSession();
      }
    };

    const timer = setInterval(evaluateSessionHealth, 15000);
    window.addEventListener('focus', evaluateSessionHealth);
    window.addEventListener('click', handleUserActivity, { passive: true });
    window.addEventListener('keydown', handleUserActivity, { passive: true });
    document.addEventListener('visibilitychange', evaluateSessionHealth);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', evaluateSessionHealth);
      window.removeEventListener('click', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      document.removeEventListener('visibilitychange', evaluateSessionHealth);
    };
  }, [user, accessToken, handleLogout, showToast]);

  const handleLoginSuccess = async (profile: UserProfile, token: string | null) => {
    setUser(profile);
    setAccessToken(token);
    touchSession();
    const count = getAuthorizedUsers().filter((u) => u.status === 'pendiente').length;
    setPendingApprovalsCount(count);
    showToast(
      'success',
      `¡Bienvenido, ${profile.displayName}! ${
        profile.role === 'administrador'
          ? 'Sesión de Administrador Central activa.'
          : 'Sesión activa como Visitante (modo consulta).'
      }`
    );

    if (pendingCalendarSyncRef.current && token) {
      const pendingAct = pendingCalendarSyncRef.current;
      pendingCalendarSyncRef.current = null;
      try {
        await createCalendarEvent(token, buildActivityCalendarEvent(pendingAct));
        showToast('success', `¡"${pendingAct.title}" agendada con éxito en Google Calendar!`);
      } catch (err: any) {
        console.error('Pending sync execution error:', err);
        showToast(
          'error',
          `No se pudo agendar "${pendingAct.title}" en Google Calendar. La actividad sigue guardada en el cronograma; puedes reintentar la sincronización.`
        );
      }
    }
  };

  const requestWorkspaceConfirmation = (
    title: string,
    description: string,
    details: { label: string; value: string }[],
    action: () => Promise<void>,
    isDestructive = false
  ) => {
    setConfirmationState({
      isOpen: true,
      title,
      description,
      details,
      isDestructive,
      onConfirm: async () => {
        setIsConfirmLoading(true);
        try {
          await action();
        } catch (e: any) {
          console.error(e);
          showToast('error', e?.message || 'Error al ejecutar la acción.');
        } finally {
          setIsConfirmLoading(false);
          setConfirmationState((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  const handleSyncToCalendar = async (act: ActivityItem, skipConfirmation = false) => {
    // Both administrators and visitors can synchronize activities with Google Calendar
    let token = accessToken;
    if (!token) {
      token = await getAccessToken();
      if (token) {
        setAccessToken(token);
      }
    }
    if (!token) {
      pendingCalendarSyncRef.current = act;
      openLogin(true);
      showToast('error', 'Se requiere conectar tu cuenta de Google Workspace para sincronizar eventos en Calendar.');
      return;
    }

    const executeCalendarSync = async () => {
      try {
        await createCalendarEvent(token!, buildActivityCalendarEvent(act));
        showToast('success', `¡"${act.title}" agendada con éxito en Google Calendar!`);
      } catch (err: any) {
        console.error('Google Calendar sync error:', err);
        if (isGoogleAuthError(err)) {
          setAccessToken(null);
          storeAccessToken(null);
          showToast(
            'error',
            'La sincronización con Google Calendar requiere reconectar tu cuenta de Google. La actividad permanece guardada en el cronograma institucional.'
          );
        } else {
          showToast('error', err?.message || 'Error al agendar en Google Calendar');
        }
      }
    };

    if (skipConfirmation) {
      await executeCalendarSync();
    } else {
      requestWorkspaceConfirmation(
        '¿Agendar en Google Calendar?',
        `Se creará un nuevo evento en tu calendario principal de Google Calendar para la actividad "${act.title}".`,
        [
          { label: 'Actividad', value: act.title },
          { label: 'Fecha y Hora', value: `${act.date} de ${act.startTime} a ${act.endTime} hs` },
          { label: 'Ubicación', value: act.location },
          { label: 'Responsable', value: act.responsible },
        ],
        executeCalendarSync
      );
    }
  };

  const handleExportToGoogleSheets = async () => {
    // Both administrators and visitors can export the master sheet
    let token = accessToken;
    if (!token) {
      token = await getAccessToken();
    }
    if (!token) {
      // If user does not have Google Workspace token, export CSV immediately so they can download the master sheet
      exportActivitiesToCsv(activities);
      showToast('success', 'Planilla Maestra exportada y descargada en CSV (compatible con Excel y Google Sheets).');
      return;
    }

    requestWorkspaceConfirmation(
      '¿Crear planilla en Google Sheets?',
      'Se creará una nueva planilla en tu cuenta de Google Drive con el registro completo de actividades del Instituto.',
      [
        { label: 'Total de actividades', value: `${activities.length} registros` },
        { label: 'Destino', value: 'Google Drive / Google Sheets' },
      ],
      async () => {
        try {
          const today = getLocalDateString();
          const newSheet = await createGoogleSheet(token!, `Instituto de Capacitación - Agenda ${today}`);
          const spreadsheetId = newSheet.spreadsheetId;

          const headerRow = ['ID', 'Fecha', 'Inicio', 'Fin', 'Tipo', 'Título', 'Ubicación', 'Responsable', 'Asistentes', 'Estado'];
          const dataRows = activities.map((act) => [
            act.id,
            act.date,
            act.startTime,
            act.endTime,
            act.type,
            act.title,
            act.location,
            act.responsible,
            act.attendeesCount || '',
            act.status,
          ]);

          await appendRowsToSheet(token!, {
            spreadsheetId,
            range: `${DEFAULT_SHEET_TAB_TITLE}!A1`,
            rows: [headerRow, ...dataRows],
          });

          const sheetUrl = newSheet.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
          showToast('success', '¡Planilla creada con éxito en Google Sheets!', {
            url: sheetUrl,
            label: 'Abrir Planilla',
          });
        } catch (err: any) {
          if (isGoogleAuthError(err)) {
            setAccessToken(null);
            storeAccessToken(null);
            // Instant fallback to CSV
            exportActivitiesToCsv(activities);
            showToast('success', 'El permiso de Google Sheets ha caducado. Se descargó automáticamente la planilla en formato CSV.');
          } else {
            showToast('error', err?.message || 'Error al exportar a Google Sheets');
          }
        }
      }
    );
  };

  const handleSaveActivity = async (newAct: ActivityItem, syncCalendar: boolean) => {
    if (!checkAdminPermission('registrar actividades')) return;

    // 1. ALWAYS safely save to institutional storage first
    const updated = saveActivity(newAct);
    setActivities(updated);

    if (!syncCalendar) {
      showToast('success', 'Actividad registrada correctamente en el cronograma institucional.');
      return;
    }

    // 2. If sync to Google Calendar is requested, verify token freshness
    let token = accessToken;
    if (!token || isStoredTokenExpired()) {
      token = await getAccessToken();
    }

    if (!token) {
      // La actividad YA está guardada en el cronograma; solo falta la sincronización.
      showToast(
        'success',
        'Actividad registrada en el cronograma institucional. No se agendó en Google Calendar porque falta conectar tu cuenta de Google.'
      );
      return;
    }

    await handleSyncToCalendar(newAct, true);
  };

  const handleUpdateActivityStatus = (id: string, status: ActivityItem['status'], reason?: string) => {
    if (!checkAdminPermission('modificar el estado de las actividades y visitas')) return;

    const updated = updateActivityStatus(id, status, reason);
    setActivities(updated);

    if (status === 'confirmada') {
      showToast('success', '¡Visita escolar confirmada oficialmente!');
    } else if (status === 'cancelada') {
      showToast('success', 'Visita escolar registrada como CANCELADA.');
    } else {
      showToast('success', 'Estado de la visita restablecido a PENDIENTE.');
    }
  };

  /** Persistencia directa de la actividad desde la ficha (encuesta CSAT: token/fecha). */
  const handleUpdateActivityFull = (act: ActivityItem) => {
    if (!checkAdminPermission('gestionar la encuesta de satisfacción de la visita')) return;
    const updated = saveActivity(act);
    setActivities(updated);
  };

  /** Elimina DEFINITIVAMENTE una actividad/visita del cronograma (y de Firestore). */
  const handleDeleteActivity = (id: string) => {
    if (!checkAdminPermission('eliminar visitas del cronograma')) return;
    // Regla del sistema: solo se eliminan visitas ya canceladas (el historial
    // confirmado/pendiente se conserva; la cancelación es el paso previo obligatorio).
    const target = getActivities().find((a) => a.id === id);
    if (!target) {
      showToast('error', 'La visita ya no existe en el cronograma.');
      return;
    }
    if (target.status !== 'cancelada') {
      showToast('error', 'Solo se pueden eliminar visitas CANCELADAS. Cancelala primero si corresponde.');
      return;
    }
    const updated = deleteActivity(id);
    setActivities(updated);
    // Si la ficha de la actividad eliminada está abierta, se cierra sola al desaparecer.
    showToast('success', 'La visita fue eliminada definitivamente del cronograma.');
  };

  const handleSaveNews = (newNews: NewsItem) => {
    if (!checkAdminPermission('publicar novedades oficiales')) return;
    const updated = saveNews(newNews);
    setNews(updated);
    showToast('success', 'Novedad publicada con éxito en la portada.');
  };

  const handleSetAnnouncementNewsId = (newsId: string | null) => {
    if (!checkAdminPermission('publicar novedades oficiales')) return;
    const updated = setAnnouncementNewsId(newsId);
    setNews(updated);
    showToast('success', newsId ? 'Comunicado asignado al Aviso Interno de portada.' : 'Aviso Interno desvinculado.');
  };

  const handleSaveCourse = (newCourse: TrainingCourse) => {
    if (!checkAdminPermission('crear o modificar trayectos formativos')) return;
    const updated = saveCourse(newCourse);
    setCourses(updated);
    showToast('success', 'Curso actualizado con éxito en la oferta académica.');
  };

  const handleSaveProgram = (newProg: ProjectProgram) => {
    if (!checkAdminPermission('incorporar nuevos programas institucionales')) return;
    const updated = saveProgram(newProg);
    setPrograms(updated);
    showToast('success', 'Programa incorporado correctamente.');
  };

  const handleSaveResource = (newRes: ResourceDocument) => {
    if (!checkAdminPermission('agregar documentación y modelos oficiales')) return;
    const updated = saveResource(newRes);
    setResources(updated);
    showToast('success', 'Recurso guardado en el repositorio documental.');
  };

  const handleDeleteResource = (id: string) => {
    if (!checkAdminPermission('eliminar recursos oficiales')) return;
    const updated = deleteResource(id);
    setResources(updated);
    showToast('success', 'Recurso eliminado del repositorio.');
  };

  /** Elimina un comunicado/novedad del sistema (y de Firestore). */
  const handleDeleteNews = (id: string) => {
    if (!checkAdminPermission('eliminar novedades oficiales')) return;
    const updated = deleteNews(id);
    setNews(updated);
    showToast('success', 'El comunicado fue eliminado definitivamente.');
  };

  const handleSaveLink = (newLink: QuickLink) => {
    if (!checkAdminPermission('modificar accesos directos')) return;
    const isEditing = quickLinks.some((l) => l.id === newLink.id);
    const updated = saveQuickLink(newLink);
    setQuickLinks(updated);
    showToast('success', isEditing ? 'Enlace actualizado con éxito.' : 'Enlace agregado con éxito.');
  };

  const handleDeleteLink = (id: string) => {
    if (!checkAdminPermission('eliminar accesos directos')) return;
    const updated = deleteQuickLink(id);
    setQuickLinks(updated);
    showToast('success', 'Enlace eliminado.');
  };

  const handleSaveTeamMember = (member: TeamMember) => {
    if (!checkAdminPermission('modificar datos del equipo')) return;
    const updated = saveTeamMember(member);
    setTeam(updated);
    showToast('success', `Datos de ${member.name} actualizados con éxito.`);
  };

  const handleDeleteTeamMember = (id: string) => {
    if (!checkAdminPermission('eliminar integrantes del equipo')) return;
    const updated = deleteTeamMember(id);
    setTeam(updated);
    showToast('success', 'Integrante eliminado del directorio.');
  };

  const handleSyncBirthdayToCalendar = async (member: TeamMember) => {
    if (!checkAdminPermission('agendar cumpleaños en Google Calendar')) return;
    let token = accessToken;
    if (!token) {
      token = await getAccessToken();
    }
    if (!token) {
      openLogin(true);
      showToast('error', 'Se requiere conectar tu cuenta de Google Workspace para sincronizar con Google Calendar.');
      return;
    }

    const countdown = getBirthdayCountdown(member.birthday);
    if (!countdown) {
      showToast('error', `Formato de fecha de cumpleaños inválido para ${member.name}.`);
      return;
    }

    requestWorkspaceConfirmation(
      '¿Agendar Cumpleaños en Google Calendar?',
      `Se agendará el cumpleaños de ${member.name} en tu calendario principal de Google Calendar con recurrencia anual.`,
      [
        { label: 'Integrante', value: member.name },
        { label: 'Puesto Laboral', value: member.role },
        { label: 'Fecha de Cumpleaños', value: countdown.formattedBirthday },
      ],
      async () => {
        try {
          await createCalendarEvent(token!, buildBirthdayCalendarEvent(member, countdown.nextDateStr));
          showToast('success', `¡Cumpleaños de ${member.name} agendado en Google Calendar con repetición anual!`);
        } catch (err: any) {
          if (isGoogleAuthError(err)) {
            setAccessToken(null);
            storeAccessToken(null);
            openLogin(true);
            showToast('error', 'La sesión de Google Workspace ha expirado. Inicia sesión con Google para renovar permisos.');
          } else {
            showToast('error', err?.message || 'Error al agendar cumpleaños');
          }
        }
      }
    );
  };

  const handleSyncAllBirthdaysToCalendar = async () => {
    if (!checkAdminPermission('sincronizar los cumpleaños del equipo en Google Calendar')) return;
    let token = accessToken;
    if (!token) {
      token = await getAccessToken();
    }
    if (!token) {
      openLogin(true);
      showToast('error', 'Se requiere conectar tu cuenta de Google Workspace para sincronizar con Google Calendar.');
      return;
    }

    requestWorkspaceConfirmation(
      '¿Sincronizar Todos los Cumpleaños en Google Calendar?',
      `Se agendarán los cumpleaños de los ${team.length} integrantes del equipo en tu Google Calendar con recurrencia anual (RRULE:YEARLY).`,
      [
        { label: 'Total de Integrantes', value: `${team.length} personas` },
        { label: 'Recurrencia', value: 'Anual (todos los años)' },
        { label: 'Aviso', value: 'Si ya los agendaste antes, se crearán eventos duplicados.' },
      ],
      async () => {
        let syncedCount = 0;
        let failedCount = 0;
        let skippedCount = 0;
        for (const member of team) {
          const countdown = getBirthdayCountdown(member.birthday);
          if (!countdown) {
            skippedCount++;
            continue;
          }
          try {
            await createCalendarEvent(token!, buildBirthdayCalendarEvent(member, countdown.nextDateStr));
            syncedCount++;
          } catch (e: any) {
            if (isGoogleAuthError(e)) {
              setAccessToken(null);
              storeAccessToken(null);
              openLogin(true);
              showToast(
                'error',
                `La sesión de Google Workspace ha expirado tras agendar ${syncedCount} cumpleaños. Inicia sesión con Google y vuelve a intentarlo (los ya agendados se duplicarían).`
              );
              return;
            }
            failedCount++;
            console.error('Error syncing member birthday', member.name, e);
          }
        }
        const notes = [
          failedCount ? `${failedCount} con error` : '',
          skippedCount ? `${skippedCount} sin fecha válida` : '',
        ].filter(Boolean);
        showToast(
          failedCount ? 'error' : 'success',
          `Se agendaron ${syncedCount} de ${team.length} cumpleaños en Google Calendar${notes.length ? ` (${notes.join(', ')})` : ''}.`
        );
      }
    );
  };

  const handleOpenEmailTo = (email: string, subject = '', body = '') => {
    setGmailRecipient(email);
    setGmailSubject(subject);
    setGmailBody(body);
    setIsGmailModalOpen(true);
  };

  const handleOpenAiAssistantWithPrompt = (prompt: string, mode: 'fast' | 'general' | 'thinking') => {
    setAiPrompt(prompt);
    setAiMode(mode);
    setIsAiModalOpen(true);
  };

  const handleHeaderSearch = (query: string) => {
    setGlobalSearch(query);
    if (query.trim() && activeTab === 'inicio') {
      setActiveTab('recursos');
    }
  };

  const handleNavigateToAgendaDate = (dateStr: string, view: 'dia' | 'semana' | 'mes' | 'lista' = 'dia') => {
    const parts = dateStr.split('-');
    const dObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (parts.length !== 3 || Number.isNaN(dObj.getTime())) return;
    setAgendaTargetDate(dObj);
    setAgendaTargetView(view);
    setActiveTab('agenda');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  };

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#001428] flex flex-col font-sans selection:bg-[#0284c7] selection:text-white">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onOpenLoginModal={() => openLogin()}
        onLogout={handleLogout}
        onOpenUserManagement={() => setIsUserManagementOpen(true)}
        pendingApprovalsCount={pendingApprovalsCount}
        isLoggingIn={isLoggingIn}
        hasWorkspaceToken={!!accessToken}
        onSearch={handleHeaderSearch}
        onOpenQuickActions={() => {
          if (checkAdminPermission('iniciar cargas de trámites')) {
            setQuickActionInitial('visita');
            setIsQuickActionsOpen(true);
          }
        }}
      />

      <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-6 py-6">
        {user && (
          <WorkspaceBanner
            user={user}
            hasToken={!!accessToken}
            onLogin={() => openLogin(true)}
          />
        )}

        {activeTab === 'inicio' && (
          user ? (
            <HomeSection
              activities={activities}
              news={news}
              courses={courses}
              quickLinks={quickLinks}
              team={team}
              onNavigateTab={setActiveTab}
              onNavigateToAgendaDate={handleNavigateToAgendaDate}
              onSaveNews={handleSaveNews}
              onDeleteNews={handleDeleteNews}
              onOpenQuickAction={(action) => {
                if (
                  checkAdminPermission(
                    action === 'visita'
                      ? 'gestionar visitas escolares'
                      : action === 'novedad'
                      ? 'publicar novedades oficiales'
                      : 'registrar actividades'
                  )
                ) {
                  setQuickActionInitial(action);
                  setIsQuickActionsOpen(true);
                }
              }}
              onSyncEventToCalendar={handleSyncToCalendar}
              hasCalendarAuth={!!accessToken}
              isAdmin={user?.role === 'administrador'}
            />
          ) : (
            <RestrictedAccessView
              mode="home"
              onOpenLoginModal={() => openLogin()}
              onNavigateTab={setActiveTab}
            />
          )
        )}

        {activeTab === 'instituto' && (
          <InstituteSection
            instSettings={instSettings}
            onNavigateTab={(tab, subTab) => {
              setActiveTab(tab);
              if (tab === 'admin' && subTab) {
                setAdminTargetSubTab(subTab as any);
              }
            }}
            isAdmin={user?.role === 'administrador'}
          />
        )}

        {activeTab === 'capacitacion' && (
          user ? (
            <TrainingSection
              courses={courses}
              onSaveCourse={handleSaveCourse}
              onOpenAiAssistantWithPrompt={AI_ASSISTANT_ENABLED ? handleOpenAiAssistantWithPrompt : undefined}
              user={user}
            />
          ) : (
            <RestrictedAccessView
              mode="module"
              isLoggedIn={!!user}
              moduleId="capacitacion"
              onOpenLoginModal={() => openLogin()}
              onNavigateTab={setActiveTab}
            />
          )
        )}

        {activeTab === 'programas' && (
          user ? (
            <ProgramsSection
              programs={programs}
              onSaveProgram={handleSaveProgram}
              onOpenEmailTo={handleOpenEmailTo}
              isAdmin={user?.role === 'administrador'}
            />
          ) : (
            <RestrictedAccessView
              mode="module"
              isLoggedIn={!!user}
              moduleId="programas"
              onOpenLoginModal={() => openLogin()}
              onNavigateTab={setActiveTab}
            />
          )
        )}

        {activeTab === 'agenda' && (
          user ? (
            <AgendaSection
              key={agendaTargetDate ? `${agendaTargetDate.getTime()}-${agendaTargetView || 'semana'}` : 'agenda-view'}
              activities={activities}
              resources={resources}
              onNavigateTab={setActiveTab}
              initialDate={agendaTargetDate}
              initialView={agendaTargetView}
              isAdmin={user?.role === 'administrador'}
              onUpdateActivityStatus={handleUpdateActivityStatus}
              onUpdateActivityFull={handleUpdateActivityFull}
              onDeleteActivity={handleDeleteActivity}
              onOpenEmailModal={handleOpenEmailTo}
              onOpenNewActivityModal={(targetDate?: string) => {
                if (checkAdminPermission('crear nuevas actividades en el cronograma')) {
                  setQuickActionInitial('visita');
                  setQuickActionInitialDate(targetDate);
                  setIsQuickActionsOpen(true);
                }
              }}
              onSyncEventToGoogleCalendar={handleSyncToCalendar}
              onExportToGoogleSheets={handleExportToGoogleSheets}
              hasWorkspaceAuth={!!accessToken}
            />
          ) : (
            <RestrictedAccessView
              mode="module"
              isLoggedIn={!!user}
              moduleId="agenda"
              onOpenLoginModal={() => openLogin()}
              onNavigateTab={setActiveTab}
            />
          )
        )}

        {activeTab === 'recursos' && (
          user ? (
            <ResourcesSection
              resources={resources}
              onSaveResource={handleSaveResource}
              onDeleteResource={handleDeleteResource}
              initialSearch={globalSearch}
              isAdmin={user?.role === 'administrador'}
            />
          ) : (
            <RestrictedAccessView
              mode="module"
              isLoggedIn={!!user}
              moduleId="recursos"
              onOpenLoginModal={() => openLogin()}
              onNavigateTab={setActiveTab}
            />
          )
        )}

        {activeTab === 'equipo' && (
          user ? (
            <TeamSection
              team={team}
              onSaveMember={handleSaveTeamMember}
              onDeleteMember={handleDeleteTeamMember}
              onOpenEmailModal={handleOpenEmailTo}
              onSyncBirthdayToCalendar={handleSyncBirthdayToCalendar}
              onSyncAllBirthdaysToCalendar={handleSyncAllBirthdaysToCalendar}
              isAdmin={user?.role === 'administrador'}
              hasWorkspaceAuth={!!accessToken}
              onRequireAuth={() => openLogin(true)}
            />
          ) : (
            <RestrictedAccessView
              mode="module"
              isLoggedIn={!!user}
              moduleId="equipo"
              onOpenLoginModal={() => openLogin()}
              onNavigateTab={setActiveTab}
            />
          )
        )}

        {activeTab === 'enlaces' && (
          user ? (
            <LinksSection
              links={quickLinks}
              onSaveLink={handleSaveLink}
              onDeleteLink={handleDeleteLink}
              isAdmin={user?.role === 'administrador'}
            />
          ) : (
            <RestrictedAccessView
              mode="module"
              isLoggedIn={!!user}
              moduleId="enlaces"
              onOpenLoginModal={() => openLogin()}
              onNavigateTab={setActiveTab}
            />
          )
        )}

        {activeTab === 'admin' && (
          user?.role === 'administrador' ? (
            <AdminSection
              user={user}
              activities={activities}
              news={news}
              programs={programs}
              resources={resources}
              quickLinks={quickLinks}
              team={team}
              onOpenQuickActions={(action) => {
                setQuickActionInitial(action);
                setIsQuickActionsOpen(true);
              }}
              onOpenUserManagement={() => setIsUserManagementOpen(true)}
              onOpenBackupModal={() => setIsBackupModalOpen(true)}
              onDeleteActivity={handleDeleteActivity}
              onNavigateTab={setActiveTab}
              hasWorkspaceToken={!!accessToken}
              onUpdateActivityStatus={handleUpdateActivityStatus}
              onSyncEventToCalendar={handleSyncToCalendar}
              onSettingsUpdated={(newSettings) => setInstSettings(newSettings)}
              onSetAnnouncementNewsId={handleSetAnnouncementNewsId}
              initialTab={adminTargetSubTab}
            />
          ) : (
            <RestrictedAccessView
              mode="module"
              isLoggedIn={!!user}
              moduleId="admin"
              onOpenLoginModal={() => openLogin()}
              onNavigateTab={setActiveTab}
            />
          )
        )}
      </main>

      <footer suppressHydrationWarning className="bg-white border-t border-slate-200 mt-12 pt-10 pb-6 text-xs text-slate-600">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pb-8 border-b border-slate-200">
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <LegislaturaLogo size="md" />
                <div>
                  <div className="text-base font-extrabold text-[#001428] leading-tight tracking-tight">
                    {instSettings.instituteName || 'Intranet Instituto'}
                  </div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-[#0284c7]">
                    {instSettings.institutionSubtitle || 'Poder Legislativo'}
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                {instSettings.description || 'Plataforma de coordinación pedagógica, extensión cívica y administración de expedientes formativos para agentes parlamentarios.'}
              </p>
            </div>

            <div className="space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#001428]">
                Soporte y Accesos
              </div>
              <ul className="space-y-2 text-xs text-slate-500">
                <li className="flex items-center justify-between">
                  <span>Mesa de Entradas:</span>
                  <span className="font-semibold text-slate-700">{instSettings.receptionExtension || 'int. 4022'}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Soporte Informático:</span>
                  <span className="font-semibold text-slate-700">{instSettings.techSupportExtension || 'int. 4108'}</span>
                </li>
                <li>
                  <button
                    onClick={() => setActiveTab('recursos')}
                    className="hover:text-[#0284c7] transition-colors cursor-pointer text-left"
                  >
                    Protocolo de Visitas
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setActiveTab('agenda')}
                    className="hover:text-[#0284c7] transition-colors cursor-pointer text-left"
                  >
                    Calendario Parlamentario
                  </button>
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#001428]">
                Documentación
              </div>
              <ul className="space-y-2 text-xs text-slate-500">
                <li>
                  <button
                    onClick={() => setActiveTab('recursos')}
                    className="hover:text-[#0284c7] transition-colors cursor-pointer text-left"
                  >
                    Recursos y documentos institucionales
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setActiveTab('enlaces')}
                    className="hover:text-[#0284c7] transition-colors cursor-pointer text-left"
                  >
                    Enlaces útiles
                  </button>
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#001428]">
                Ubicación y Contacto
              </div>
              <div className="space-y-1.5 text-xs text-slate-500 leading-relaxed">
                <p className="font-medium text-slate-700">{instSettings.address || 'Palacio Legislativo - Anexo Rivadavia, Av. Rivadavia 1864, Piso 3°'}</p>
                {instSettings.city && <p className="text-slate-500">{instSettings.city}</p>}
                {instSettings.operatingHours && (
                  <p className="text-[11px] text-slate-500 pt-0.5">
                    <span className="font-semibold text-slate-600">Horario:</span> {instSettings.operatingHours}
                  </p>
                )}
                {instSettings.phone && (
                  <p className="text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-600">Tel:</span> {instSettings.phone}
                  </p>
                )}
                {instSettings.contactEmail && (
                  <a
                    href={`mailto:${instSettings.contactEmail}`}
                    className="text-[#0284c7] hover:underline block pt-1 font-semibold"
                  >
                    {instSettings.contactEmail}
                  </a>
                )}
              </div>
            </div>
          </div>

          <div suppressHydrationWarning className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400">
            <div suppressHydrationWarning>
              © {new Date().getFullYear()} {instSettings.instituteName || 'Instituto de Capacitación y Gestión Pública'} - {instSettings.institutionSubtitle || 'Poder Legislativo'}. {instSettings.copyrightText || 'Todos los derechos reservados.'}
            </div>
            <div className="flex items-center gap-4">
              <span>Intranet institucional</span>
              {user?.role === 'administrador' && (
                <button
                  onClick={() => {
                    if (checkAdminPermission('descargar o restaurar copias de seguridad')) {
                      setIsBackupModalOpen(true);
                    }
                  }}
                  className="flex items-center gap-1.5 text-slate-600 hover:text-[#0284c7] cursor-pointer font-medium"
                >
                  <Database className="w-3.5 h-3.5 text-[#0284c7]" />
                  <span>Respaldo de datos (JSON)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </footer>

      <LoginModal
        isOpen={isLoginModalOpen}
        workspaceIntent={loginWorkspaceIntent}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      <UserManagementModal
        isOpen={isUserManagementOpen && user?.role === 'administrador'}
        onClose={() => {
          setIsUserManagementOpen(false);
          setPendingApprovalsCount(getAuthorizedUsers().filter((u) => u.status === 'pendiente').length);
        }}
        onUsersUpdated={() => {
          setPendingApprovalsCount(getAuthorizedUsers().filter((u) => u.status === 'pendiente').length);
        }}
      />

      <QuickActionsModal
        key={`quick-${isQuickActionsOpen}-${quickActionInitial}-${quickActionInitialDate || 'none'}`}
        isOpen={isQuickActionsOpen}
        onClose={() => {
          setIsQuickActionsOpen(false);
          setQuickActionInitialDate(undefined);
        }}
        onSaveActivity={handleSaveActivity}
        onSaveNews={handleSaveNews}
        hasCalendarAuth={!!accessToken}
        initialAction={quickActionInitial}
        initialDate={quickActionInitialDate}
      />

      {AI_ASSISTANT_ENABLED && (
        <GeminiAssistantModal
          key={`ai-${isAiModalOpen}-${aiMode}-${aiPrompt}`}
          isOpen={isAiModalOpen}
          onClose={() => setIsAiModalOpen(false)}
          initialPrompt={aiPrompt}
          initialMode={aiMode}
        />
      )}

      <GmailComposerModal
        key={`gmail-${isGmailModalOpen}-${gmailRecipient}-${gmailSubject}-${gmailBody.slice(0, 20)}`}
        isOpen={isGmailModalOpen}
        onClose={() => setIsGmailModalOpen(false)}
        defaultTo={gmailRecipient}
        defaultSubject={gmailSubject}
        defaultBody={gmailBody}
        accessToken={accessToken}
        currentUser={user}
        onRequireAuth={() => openLogin(true)}
        onAuthExpired={() => {
          setAccessToken(null);
          storeAccessToken(null);
        }}
        onRequireConfirmation={requestWorkspaceConfirmation}
      />

      <ConfirmationModal
        isOpen={confirmationState.isOpen}
        title={confirmationState.title}
        description={confirmationState.description}
        itemDetails={confirmationState.details}
        isDestructive={confirmationState.isDestructive}
        onConfirm={confirmationState.onConfirm}
        onCancel={() => setConfirmationState((prev) => ({ ...prev, isOpen: false }))}
        isLoading={isConfirmLoading}
      />

      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onDataChanged={reloadData}
      />

      {toast && (
        <div className="fixed bottom-5 right-5 z-[110] flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-xl border border-slate-800 bg-[#001428] text-white text-xs sm:text-sm animate-in slide-in-from-bottom-3 duration-200 max-w-md">
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <div className="flex-1">
            <span>{toast.message}</span>
            {toast.link && (
              <a
                href={toast.link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sky-400 hover:underline font-bold ml-2"
              >
                <span>{toast.link.label}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
