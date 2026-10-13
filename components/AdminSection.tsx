'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Building2,
  Users,
  Database,
  FileText,
  Save,
  RotateCcw,
  CheckCircle2,
  Calendar,
  Sparkles,
  Lock,
  Plus,
  PlusCircle,
  FolderOpen,
  ArrowRight,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
  BellRing,
  Megaphone,
  Globe,
  Settings,
  BarChart3,
  Sliders,
  Layers,
  GraduationCap,
  GripVertical,
  Edit2,
  Trash2,
  Check,
  X,
  AlertCircle,
  AlertTriangle,
  Scale,
  Cpu,
  FileCheck2,
  Shield,
  Compass,
  Target,
  Award,
  BookOpen,
  Landmark,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Search,
  Filter,
  Star,
  Phone,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import {
  getInstitutionalSettings,
  saveInstitutionalSettings,
  DEFAULT_SETTINGS,
  type InstitutionalSettings,
  type MetricGoalSettings,
  DEFAULT_GOAL_SETTINGS,
  getInstituteAreas,
  saveInstituteAreas,
  saveInstituteArea,
  deleteInstituteArea,
  reorderInstituteArea,
  resetInstituteAreas,
  updateActivityStatus,
  saveActivity,
  getCourseAudits,
  getCourseCsatStats,
  adminApproveCourseAudit,
  adminObserveCourseAudit,
  adminResetCourseAudit,
} from '@/lib/storage';
import { Reorder, useDragControls } from 'motion/react';
import { useBottomSheetDrag } from '@/lib/useBottomSheetDrag';
import { BottomSheetHandle } from '@/components/BottomSheetHandle';
import {
  getAuthorizedUsers,
  getApprovalMode,
  setApprovalMode,
  getEffectiveFirebaseConfig,
  type UserProfile,
} from '@/lib/auth';
import type {
  ActivityItem,
  NewsItem,
  ProjectProgram,
  ResourceDocument,
  QuickLink,
  TeamMember,
  InstituteAreaCard,
  InstituteAreaIconName,
  AgentCourseAudit,
} from '@/lib/mock-data';

interface AdminSectionProps {
  user: UserProfile | null;
  activities: ActivityItem[];
  news: NewsItem[];
  programs: ProjectProgram[];
  resources: ResourceDocument[];
  quickLinks: QuickLink[];
  team: TeamMember[];
  onOpenQuickActions: (action: 'visita' | 'actividad' | 'novedad') => void;
  onOpenUserManagement: () => void;
  onOpenBackupModal: () => void;
  onNavigateTab: (tab: string) => void;
  hasWorkspaceToken: boolean;
  onUpdateActivityStatus?: (id: string, status: ActivityItem['status'], reason?: string) => void;
  onSyncEventToCalendar?: (activity: ActivityItem) => void;
  onSettingsUpdated?: (settings: InstitutionalSettings) => void;
  onSetAnnouncementNewsId?: (id: string | null) => void;
  initialTab?: 'visitas' | 'objetivos' | 'auditoria_cursos' | 'cards_instituto' | 'institucional' | 'usuarios' | 'contenidos' | 'mantenimiento';
}

const AVAILABLE_ICONS: { name: InstituteAreaIconName; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { name: 'Scale', label: 'Balanza / Jurídica', icon: Scale },
  { name: 'GraduationCap', label: 'Birrete / Académica', icon: GraduationCap },
  { name: 'Users', label: 'Equipo / Comunidad', icon: Users },
  { name: 'Cpu', label: 'Tecnología / IA', icon: Cpu },
  { name: 'FileCheck2', label: 'Gestión / Protocolo', icon: FileCheck2 },
  { name: 'Building2', label: 'Palacio / Sede', icon: Building2 },
  { name: 'Shield', label: 'Ética / Transparencia', icon: Shield },
  { name: 'Compass', label: 'Brújula / Misión', icon: Compass },
  { name: 'Target', label: 'Objetivos / Metas', icon: Target },
  { name: 'Award', label: 'Calidad / Certificación', icon: Award },
  { name: 'BookOpen', label: 'Biblioteca / Formación', icon: BookOpen },
  { name: 'Landmark', label: 'Cámara / República', icon: Landmark },
];

function DraggableAreaCardItem({
  area,
  index,
  total,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  area: InstituteAreaCard;
  index: number;
  total: number;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const controls = useDragControls();
  const Icon = AVAILABLE_ICONS.find((i) => i.name === area.iconName)?.icon || Building2;
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <Reorder.Item
      value={area}
      id={area.id}
      dragListener={false}
      dragControls={controls}
      whileDrag={{
        scale: 1.02,
        zIndex: 999,
        boxShadow: '0 20px 25px -5px rgba(0, 20, 40, 0.25), 0 8px 10px -6px rgba(0, 20, 40, 0.2)',
        borderColor: '#0284c7',
        backgroundColor: '#ffffff',
      }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      layout
      className="p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 shadow-2xs relative select-none"
    >
      {/* Top row on mobile / Left group on desktop */}
      <div className="flex items-center justify-between md:justify-start gap-2.5 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Grip Handle for touch & mouse drag */}
          <div
            onPointerDown={(e) => controls.start(e)}
            style={{ touchAction: 'none' }}
            className="p-2 sm:p-2.5 rounded-lg bg-slate-100 hover:bg-sky-50 active:bg-sky-100 text-slate-500 hover:text-[#0284c7] active:text-[#0284c7] border border-slate-200 hover:border-sky-300 cursor-grab active:cursor-grabbing touch-none select-none shrink-0 transition-colors flex items-center gap-1.5"
            title="Mantén presionado y arrastra para reordenar"
            aria-label="Arrastrar para reordenar"
          >
            <GripVertical className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-[11px] font-bold hidden lg:inline text-slate-600">Arrastrar</span>
          </div>

          {/* Position badge dinámico */}
          <div className="flex flex-row md:flex-col items-center justify-center py-1 sm:py-1.5 px-2.5 sm:px-3 rounded-lg bg-slate-50 border border-slate-200 gap-1.5 md:gap-0 min-w-[70px] shrink-0">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 hidden md:block">Posición</span>
            <span className="text-sm sm:text-base font-black text-[#001428]">#{index + 1}</span>
            <span className="text-[9px] sm:text-[10px] text-[#0284c7] font-bold truncate max-w-[80px]">
              {isFirst ? 'Primera' : isLast ? 'Última' : `${index + 1}° de ${total}`}
            </span>
          </div>
        </div>

        {/* Mobile quick move up/down buttons */}
        <div className="flex md:hidden items-center gap-1">
          <button
            type="button"
            disabled={isFirst}
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp?.();
            }}
            className={`p-1.5 rounded-lg border transition-colors ${
              isFirst
                ? 'opacity-30 cursor-not-allowed border-slate-200 text-slate-400 bg-slate-50'
                : 'border-slate-300 text-slate-700 bg-white hover:bg-slate-100 active:bg-slate-200 cursor-pointer shadow-2xs'
            }`}
            title="Subir una posición"
            aria-label="Subir una posición"
          >
            <ChevronUp className="w-4 h-4 text-slate-700" />
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown?.();
            }}
            className={`p-1.5 rounded-lg border transition-colors ${
              isLast
                ? 'opacity-30 cursor-not-allowed border-slate-200 text-slate-400 bg-slate-50'
                : 'border-slate-300 text-slate-700 bg-white hover:bg-slate-100 active:bg-slate-200 cursor-pointer shadow-2xs'
            }`}
            title="Bajar una posición"
            aria-label="Bajar una posición"
          >
            <ChevronDown className="w-4 h-4 text-slate-700" />
          </button>
        </div>
      </div>

      {/* Center: Card Content Preview */}
      <div className="flex-1 min-w-0 flex items-start gap-3">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#001428] text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
          <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
        </div>
        <div className="space-y-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider text-[#0284c7] px-2 py-0.5 rounded bg-blue-50 border border-blue-200">
              {area.tag}
            </span>
            <span className="text-[11px] font-semibold text-[#0284c7] truncate">{area.role}</span>
          </div>
          <h4 className="text-sm font-bold text-[#001428] leading-snug">{area.title}</h4>
          <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{area.desc}</p>
        </div>
      </div>

      {/* Right / Bottom: Action buttons (full-width on mobile, flex on desktop) */}
      <div className="flex items-center gap-2 shrink-0 w-full md:w-auto pt-2.5 md:pt-0 border-t md:border-t-0 border-slate-100">
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 text-xs font-bold text-[#001428] transition-colors cursor-pointer shadow-2xs"
        >
          <Edit2 className="w-3.5 h-3.5 text-[#0284c7]" />
          <span>Editar</span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-2 sm:p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 hover:border-rose-300 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
          title="Eliminar esta card"
          aria-label="Eliminar esta card"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </Reorder.Item>
  );
}

export function AdminSection({
  user,
  activities,
  news,
  programs,
  resources,
  quickLinks,
  team,
  onOpenQuickActions,
  onOpenUserManagement,
  onOpenBackupModal,
  onNavigateTab,
  hasWorkspaceToken,
  onUpdateActivityStatus,
  onSyncEventToCalendar,
  onSettingsUpdated,
  onSetAnnouncementNewsId,
  initialTab,
}: AdminSectionProps) {
  const [activeAdminTab, setActiveAdminTab] = useState<
    'visitas' | 'objetivos' | 'auditoria_cursos' | 'cards_instituto' | 'institucional' | 'usuarios' | 'contenidos' | 'mantenimiento'
  >(initialTab || 'visitas');

  useEffect(() => {
    if (initialTab) {
      setActiveAdminTab(initialTab);
    }
  }, [initialTab]);

  const [settings, setSettings] = useState<InstitutionalSettings>(DEFAULT_SETTINGS);
  const [settingsSavedMessage, setSettingsSavedMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Confirmation Modals State (Eliminates browser window.confirm for iframe & mobile robustness)
  const [cardToDelete, setCardToDelete] = useState<InstituteAreaCard | null>(null);
  const [isResetAreasConfirmOpen, setIsResetAreasConfirmOpen] = useState(false);
  const [isResetSettingsConfirmOpen, setIsResetSettingsConfirmOpen] = useState(false);

  // Users & Approval
  const [approvalModeState, setApprovalModeState] = useState<'manual' | 'auto_visitor'>(() => getApprovalMode());
  const [authorizedUsers, setAuthorizedUsers] = useState(() => getAuthorizedUsers());

  // Cards de Instituto
  const [areas, setAreas] = useState<InstituteAreaCard[]>(() => getInstituteAreas());
  const [editingArea, setEditingArea] = useState<InstituteAreaCard | null>(null);
  const [isCreatingArea, setIsCreatingArea] = useState(false);

  // Visitas Escolares state
  const [visitFilter, setVisitFilter] = useState<'todas' | 'pendiente' | 'confirmada' | 'cancelada'>('todas');
  const [visitSearch, setVisitSearch] = useState('');
  const [cancellingVisit, setCancellingVisit] = useState<ActivityItem | null>(null);
  const [cancellationReasonInput, setCancellationReasonInput] = useState('');

  // Course Audits & Anti-Fraud Checklist state
  const [courseAudits, setCourseAudits] = useState<AgentCourseAudit[]>(() => getCourseAudits());
  const [auditFilter, setAuditFilter] = useState<'todos' | 'alertas' | 'consistentes' | 'aprobados'>('todos');
  const [auditSearch, setAuditSearch] = useState('');

  // Sincronización global con storage
  useEffect(() => {
    setSettings(getInstitutionalSettings());
    setAuthorizedUsers(getAuthorizedUsers());
    setApprovalModeState(getApprovalMode());
    setAreas(getInstituteAreas());
    setCourseAudits(getCourseAudits());
    setGoalForm(getInstitutionalSettings().metricGoal || DEFAULT_GOAL_SETTINGS);

    const handleStorageChange = () => {
      setSettings(getInstitutionalSettings());
      setAuthorizedUsers(getAuthorizedUsers());
      setApprovalModeState(getApprovalMode());
      setAreas(getInstituteAreas());
      setCourseAudits(getCourseAudits());
      setGoalForm(getInstitutionalSettings().metricGoal || DEFAULT_GOAL_SETTINGS);
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleApproveAudit = (auditId: string) => {
    const targetAudit = courseAudits.find((a) => a.id === auditId);
    if (!targetAudit || (!targetAudit.isFullyCompleted && targetAudit.completedModulesCount < targetAudit.totalModules)) {
      setSuccessMessage('No se puede homologar: el agente debe completar el 100% de la cursada en Drive.');
      setTimeout(() => setSuccessMessage(null), 3500);
      return;
    }
    const updated = adminApproveCourseAudit(auditId);
    setCourseAudits(updated);
    setSuccessMessage('¡Certificado homologado y emitido con éxito!');
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  const handleObserveAudit = (auditId: string) => {
    const updated = adminObserveCourseAudit(
      auditId,
      'Observado por detección de inconsistencias en cursada. Se requiere corroboración de lectura presencial/asistida.'
    );
    setCourseAudits(updated);
    setSuccessMessage('Cursada marcada como Observada. Se descontó del cómputo de certificados homologados.');
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  const handleResetAudit = (auditId: string) => {
    const updated = adminResetCourseAudit(auditId);
    setCourseAudits(updated);
    setSuccessMessage('Cursada reiniciada a 0. Se descontó del cómputo de certificados homologados.');
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  const handleSaveSettings = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      const saved = saveInstitutionalSettings(settings);
      setSettings(saved);
      if (onSettingsUpdated) {
        onSettingsUpdated(saved);
      }
      const msg = '¡Configuración institucional y pilares guardados y sincronizados correctamente con la sección Instituto y el pie de página!';
      setSuccessMessage(msg);
      setSettingsSavedMessage(msg);
      setTimeout(() => {
        setSuccessMessage(null);
        setSettingsSavedMessage(null);
      }, 5000);
    } catch (err) {
      console.error('Error al guardar datos institucionales:', err);
    }
  };

  const handleResetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    const saved = saveInstitutionalSettings(DEFAULT_SETTINGS);
    if (onSettingsUpdated) {
      onSettingsUpdated(saved);
    }
    const msg = 'Se restauraron los datos institucionales predeterminados.';
    setSuccessMessage(msg);
    setSettingsSavedMessage(msg);
    setTimeout(() => {
      setSuccessMessage(null);
      setSettingsSavedMessage(null);
    }, 5000);
  };

  // --- GOAL METRICS HANDLERS ---
  const [goalForm, setGoalForm] = useState<MetricGoalSettings>(DEFAULT_GOAL_SETTINGS);

  const handleSaveGoalSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = {
      ...settings,
      metricGoal: goalForm,
    };
    setSettings(updated);
    saveInstitutionalSettings(updated);
    setSuccessMessage(
      `¡Objetivo ${goalForm.period === 'anual' ? 'Anual' : 'Mensual'} de ${
        goalForm.metricType === 'visitas'
          ? 'Visitas Escolares'
          : goalForm.metricType === 'agentes'
          ? 'Agentes Formados'
          : 'Agentes y Visitas'
      } guardado exitosamente!`
    );
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleResetGoalSettings = () => {
    setGoalForm(DEFAULT_GOAL_SETTINGS);
    const updated = {
      ...settings,
      metricGoal: DEFAULT_GOAL_SETTINGS,
    };
    setSettings(updated);
    saveInstitutionalSettings(updated);
    setSuccessMessage('Se restablecieron los objetivos de carga predeterminados (1.750 agentes anuales).');
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // --- CARDS INSTITUTO HANDLERS ---
  const handleMoveAreaPosition = (id: string, targetPosition: number) => {
    const updated = reorderInstituteArea(id, targetPosition);
    setAreas(updated);
    setSuccessMessage(`Card reposicionada en la ubicación #${targetPosition}.`);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleReorderAreas = (newOrder: InstituteAreaCard[]) => {
    const reindexed = newOrder.map((card, idx) => ({
      ...card,
      order: idx + 1,
    }));
    setAreas(reindexed);
    saveInstituteAreas(reindexed);
    setSuccessMessage('Orden de cards del Instituto actualizado correctamente.');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const isAreaModalOpen = Boolean(editingArea || isCreatingArea);
  const handleCloseAreaModal = () => {
    setEditingArea(null);
    setIsCreatingArea(false);
  };
  const areaSheet = useBottomSheetDrag({
    isOpen: isAreaModalOpen,
    onClose: handleCloseAreaModal,
  });

  const handleSaveAreaCard = (cardData: InstituteAreaCard) => {
    const updated = saveInstituteArea(cardData);
    setAreas(updated);
    handleCloseAreaModal();
    setSuccessMessage(`Card "${cardData.title}" guardada exitosamente.`);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleDeleteAreaCard = (card: InstituteAreaCard) => {
    setCardToDelete(card);
  };

  const handleConfirmDeleteAreaCard = () => {
    if (!cardToDelete) return;
    const updated = deleteInstituteArea(cardToDelete.id);
    setAreas(updated);
    setSuccessMessage(`Card "${cardToDelete.title}" eliminada de la sección Instituto.`);
    setCardToDelete(null);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleConfirmResetAreas = () => {
    const reset = resetInstituteAreas();
    setAreas(reset);
    setSuccessMessage('Cards y orden del Instituto restablecidos a los valores oficiales.');
    setIsResetAreasConfirmOpen(false);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleConfirmResetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    const saved = saveInstitutionalSettings(DEFAULT_SETTINGS);
    if (onSettingsUpdated) {
      onSettingsUpdated(saved);
    }
    const msg = 'Se restauraron los datos institucionales predeterminados.';
    setSuccessMessage(msg);
    setSettingsSavedMessage(msg);
    setIsResetSettingsConfirmOpen(false);
    setTimeout(() => {
      setSuccessMessage(null);
      setSettingsSavedMessage(null);
    }, 5000);
  };

  // --- VISITAS ESCOLARES HANDLERS ---
  const schoolVisits = useMemo(() => {
    return activities.filter((a) => a.type === 'visita');
  }, [activities]);

  const pendingVisitsCount = schoolVisits.filter((v) => v.status === 'pendiente').length;
  const confirmedVisitsCount = schoolVisits.filter((v) => v.status === 'confirmada' || v.status === 'en_curso' || v.status === 'finalizada').length;
  const cancelledVisitsCount = schoolVisits.filter((v) => v.status === 'cancelada').length;
  const totalAlumnosVisitas = schoolVisits
    .filter((v) => v.status !== 'cancelada')
    .reduce((sum, v) => sum + (v.attendeesCount || 0), 0);

  const filteredVisits = useMemo(() => {
    return schoolVisits.filter((v) => {
      if (visitFilter === 'pendiente' && v.status !== 'pendiente') return false;
      if (visitFilter === 'confirmada' && v.status !== 'confirmada' && v.status !== 'en_curso' && v.status !== 'finalizada') return false;
      if (visitFilter === 'cancelada' && v.status !== 'cancelada') return false;

      if (visitSearch.trim()) {
        const q = visitSearch.toLowerCase();
        const matchTitle = v.title.toLowerCase().includes(q);
        const matchInst = (v.institution || '').toLowerCase().includes(q);
        const matchLevel = (v.level || '').toLowerCase().includes(q);
        const matchResp = (v.responsible || '').toLowerCase().includes(q);
        return matchTitle || matchInst || matchLevel || matchResp;
      }
      return true;
    });
  }, [schoolVisits, visitFilter, visitSearch]);

  const handleConfirmVisit = (visit: ActivityItem) => {
    if (onUpdateActivityStatus) {
      onUpdateActivityStatus(visit.id, 'confirmada');
    } else {
      updateActivityStatus(visit.id, 'confirmada');
    }
    setSuccessMessage(`¡Visita de "${visit.institution || visit.title}" confirmada oficialmente!`);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleOpenCancelModal = (visit: ActivityItem) => {
    setCancellingVisit(visit);
    setCancellationReasonInput(visit.cancellationReason || 'Inconveniente de la institución escolar');
  };

  const handleConfirmCancellation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingVisit) return;

    const reason = cancellationReasonInput.trim() || 'Visita cancelada por inconvenientes o inasistencia del contingente';
    if (onUpdateActivityStatus) {
      onUpdateActivityStatus(cancellingVisit.id, 'cancelada', reason);
    } else {
      updateActivityStatus(cancellingVisit.id, 'cancelada', reason);
    }
    setSuccessMessage(`La visita de "${cancellingVisit.institution || cancellingVisit.title}" fue marcada como CANCELADA.`);
    setCancellingVisit(null);
    setCancellationReasonInput('');
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleReopenVisit = (visit: ActivityItem) => {
    if (onUpdateActivityStatus) {
      onUpdateActivityStatus(visit.id, 'pendiente');
    } else {
      updateActivityStatus(visit.id, 'pendiente');
    }
    setSuccessMessage(`La visita de "${visit.institution || visit.title}" volvió al estado PENDIENTE.`);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleToggleApprovalMode = () => {
    const next = approvalModeState === 'manual' ? 'auto_visitor' : 'manual';
    setApprovalMode(next);
    setApprovalModeState(next);
    setSuccessMessage(
      next === 'manual'
        ? 'Modo de registro cambiado a Aprobación Manual (Estricto).'
        : 'Modo de registro cambiado a Aprobación Automática como Visitante.'
    );
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // --- AUDITORÍA DE CURSOS COMPUTATIONS ---
  const simultaneousAlertsCount = useMemo(() => {
    return courseAudits.filter((a) => a.auditStatus === 'alerta_simultanea').length;
  }, [courseAudits]);

  const consistentCount = useMemo(() => {
    return courseAudits.filter((a) => a.auditStatus === 'consistente').length;
  }, [courseAudits]);

  const approvedAuditsCount = useMemo(() => {
    return courseAudits.filter((a) => a.auditStatus === 'aprobado_admin').length;
  }, [courseAudits]);

  const filteredAudits = useMemo(() => {
    return courseAudits.filter((a) => {
      if (auditFilter === 'alertas' && a.auditStatus !== 'alerta_simultanea') return false;
      if (auditFilter === 'consistentes' && a.auditStatus !== 'consistente') return false;
      if (auditFilter === 'aprobados' && a.auditStatus !== 'aprobado_admin') return false;
      if (auditSearch.trim()) {
        const q = auditSearch.toLowerCase();
        return (
          a.agentName.toLowerCase().includes(q) ||
          a.agentEmail.toLowerCase().includes(q) ||
          a.courseTitle.toLowerCase().includes(q) ||
          a.agentArea.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [courseAudits, auditFilter, auditSearch]);

  // Live preview metrics for Goal setting
  const liveAgentesFormados = useMemo(() => {
    // Solo datos reales: asistentes cargados + cursadas digitales completadas y
    // homologadas por Administración. Sin base histórica ni estimados ficticios
    // (antes sumaba 1.260 fijos + 35 por curso, números de prueba).
    const capacitacionAttendees = activities
      .filter((a) => a.type === 'capacitacion' && a.status !== 'cancelada')
      .reduce((sum, a) => sum + (a.attendeesCount || 0), 0);
    const approvedAuditsCount = courseAudits.filter(
      (audit) => !audit.isSample && (audit.auditStatus === 'aprobado_admin' || audit.certifiedAt)
    ).length;
    return capacitacionAttendees + approvedAuditsCount;
  }, [activities, courseAudits]);

  const liveVisitasConfirmadas = confirmedVisitsCount;

  const liveGoalPct = useMemo(() => {
    if (goalForm.metricType === 'visitas') {
      return Math.min(100, Math.round((liveVisitasConfirmadas / Math.max(1, goalForm.targetVisitas)) * 100));
    }
    return Math.min(100, Math.round((liveAgentesFormados / Math.max(1, goalForm.targetAgentes)) * 100));
  }, [goalForm, liveAgentesFormados, liveVisitasConfirmadas]);

  const pendingUsersCount = authorizedUsers.filter((u) => u.status === 'pendiente').length;
  const approvedUsersCount = authorizedUsers.filter((u) => u.status === 'aprobado').length;
  const firebaseInfo = getEffectiveFirebaseConfig();

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner: Admin Identification */}
      <div className="bg-[#001428] text-white rounded-xl p-5 sm:p-6 shadow-md border border-slate-800">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 text-[10px] font-extrabold uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>Acceso Exclusivo • Administrador Central del Sistema</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Panel de Administración y Configuración
          </h1>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Centro de mando integral: define objetivos y barra de carga, aprueba y cancela visitas escolares, personaliza el orden de las cards de Instituto y gestiona la seguridad institucional.
          </p>
        </div>

        {/* Admin Quick Stat Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 mt-5 border-t border-slate-800 text-xs">
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/10">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Sesión Activa</div>
            <div className="font-bold text-white truncate mt-0.5">{user?.displayName || 'Administrador'}</div>
          </div>
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/10">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Visitas Pendientes</div>
            <div className={`font-bold mt-0.5 ${pendingVisitsCount > 0 ? 'text-amber-400 font-extrabold flex items-center gap-1' : 'text-slate-300'}`}>
              {pendingVisitsCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>}
              <span>{pendingVisitsCount} por confirmar</span>
            </div>
          </div>
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/10">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Meta de Gestión</div>
            <div className="font-bold text-sky-400 mt-0.5">
              {goalForm.period === 'anual' ? 'Anual' : 'Mensual'}:{' '}
              {goalForm.metricType === 'visitas'
                ? `${goalForm.targetVisitas} visitas`
                : `${goalForm.targetAgentes} agentes`}
            </div>
          </div>
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/10">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Cards Instituto</div>
            <div className="font-bold text-emerald-400 mt-0.5">{areas.length} áreas operativas</div>
          </div>
        </div>
      </div>

      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Admin Module Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="flex border-b border-slate-200 overflow-x-auto scrollbar-none bg-slate-50/70 p-1.5 gap-1.5">
          {/* TAB 1: VISITAS ESCOLARES */}
          <button
            type="button"
            onClick={() => setActiveAdminTab('visitas')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeAdminTab === 'visitas'
                ? 'bg-white text-[#001428] shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-[#001428] hover:bg-white/60'
            }`}
          >
            <Calendar className="w-4 h-4 text-[#0284c7]" />
            <span>Visitas Escolares</span>
            {pendingVisitsCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[9px] font-extrabold animate-pulse">
                {pendingVisitsCount} pendientes
              </span>
            ) : (
              <span className="px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 text-[9px] font-bold">
                {schoolVisits.length}
              </span>
            )}
          </button>

          {/* TAB 2: OBJETIVOS Y BARRA DE CARGA */}
          <button
            type="button"
            onClick={() => setActiveAdminTab('objetivos')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeAdminTab === 'objetivos'
                ? 'bg-white text-[#001428] shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-[#001428] hover:bg-white/60'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-[#0284c7]" />
            <span>Objetivos & Barra de Carga</span>
          </button>

          {/* TAB: AUDITORÍA DE CURSOS Y CONTROL DE LECTURA */}
          <button
            type="button"
            onClick={() => setActiveAdminTab('auditoria_cursos')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeAdminTab === 'auditoria_cursos'
                ? 'bg-white text-[#001428] shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-[#001428] hover:bg-white/60'
            }`}
          >
            <GraduationCap className="w-4 h-4 text-[#0284c7]" />
            <span>Auditoría de Cursos (Checklists)</span>
            {simultaneousAlertsCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-extrabold animate-pulse">
                {simultaneousAlertsCount} alerta{simultaneousAlertsCount > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 text-[9px] font-bold">
                {courseAudits.length}
              </span>
            )}
          </button>

          {/* TAB 3: CARDS DE INSTITUTO */}
          <button
            type="button"
            onClick={() => setActiveAdminTab('cards_instituto')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeAdminTab === 'cards_instituto'
                ? 'bg-white text-[#001428] shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-[#001428] hover:bg-white/60'
            }`}
          >
            <Sliders className="w-4 h-4 text-[#0284c7]" />
            <span>Cards del Instituto</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 text-[9px] font-bold">
              {areas.length}
            </span>
          </button>

          {/* TAB 4: DATOS INSTITUCIONALES */}
          <button
            type="button"
            onClick={() => setActiveAdminTab('institucional')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeAdminTab === 'institucional'
                ? 'bg-white text-[#001428] shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-[#001428] hover:bg-white/60'
            }`}
          >
            <Building2 className="w-4 h-4 text-[#0284c7]" />
            <span>Datos Institucionales</span>
          </button>

          {/* TAB 5: ACREDITACIONES Y ACCESOS */}
          <button
            type="button"
            onClick={() => setActiveAdminTab('usuarios')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeAdminTab === 'usuarios'
                ? 'bg-white text-[#001428] shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-[#001428] hover:bg-white/60'
            }`}
          >
            <Users className="w-4 h-4 text-[#0284c7]" />
            <span>Acreditaciones</span>
            {pendingUsersCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-extrabold">
                {pendingUsersCount}
              </span>
            )}
          </button>

          {/* TAB 6: MANTENIMIENTO */}
          <button
            type="button"
            onClick={() => setActiveAdminTab('mantenimiento')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeAdminTab === 'mantenimiento'
                ? 'bg-white text-[#001428] shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-[#001428] hover:bg-white/60'
            }`}
          >
            <Database className="w-4 h-4 text-[#0284c7]" />
            <span>Respaldos & Servidores</span>
          </button>
        </div>

        <div className="p-5 sm:p-6">
          {/* ========================================================
              TAB: VISITAS ESCOLARES (CONFIRMACIÓN, CANCELACIÓN Y ESTADOS)
             ======================================================== */}
          {activeAdminTab === 'visitas' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-extrabold text-[#001428] flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-[#0284c7]" />
                    <span>Gestión y Aprobación de Visitas Escolares</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Toda solicitud ingresa con estado <strong>Pendiente</strong>. Como Administrador, puedes confirmarla para fijarla en agenda o cancelarla por inconvenientes de la institución.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenQuickActions('visita')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#001428] hover:bg-[#122a45] text-white text-xs font-bold transition-colors cursor-pointer shadow-xs shrink-0 self-start sm:self-auto"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Nueva Solicitud de Visita</span>
                </button>
              </div>

              {/* Status Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div
                  onClick={() => setVisitFilter('todas')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    visitFilter === 'todas'
                      ? 'bg-blue-50/70 border-[#0284c7] ring-1 ring-[#0284c7]'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Total Solicitudes</div>
                  <div className="text-2xl font-black text-[#001428] mt-1">{schoolVisits.length}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{totalAlumnosVisitas} alumnos totales</div>
                </div>

                <div
                  onClick={() => setVisitFilter('pendiente')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    visitFilter === 'pendiente'
                      ? 'bg-amber-50/70 border-amber-500 ring-1 ring-amber-500'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 flex items-center gap-1">
                    {pendingVisitsCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>}
                    <span>Por Confirmar</span>
                  </div>
                  <div className="text-2xl font-black text-amber-900 mt-1">{pendingVisitsCount}</div>
                  <div className="text-[10px] text-amber-700 font-semibold mt-0.5">Requieren tu aprobación</div>
                </div>

                <div
                  onClick={() => setVisitFilter('confirmada')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    visitFilter === 'confirmada'
                      ? 'bg-emerald-50/70 border-emerald-500 ring-1 ring-emerald-500'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">Confirmadas / En Curso</div>
                  <div className="text-2xl font-black text-emerald-900 mt-1">{confirmedVisitsCount}</div>
                  <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">Fijadas en cronograma</div>
                </div>

                <div
                  onClick={() => setVisitFilter('cancelada')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    visitFilter === 'cancelada'
                      ? 'bg-rose-50/70 border-rose-500 ring-1 ring-rose-500'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700">Canceladas</div>
                  <div className="text-2xl font-black text-rose-900 mt-1">{cancelledVisitsCount}</div>
                  <div className="text-[10px] text-rose-700 font-semibold mt-0.5">Con motivo registrado</div>
                </div>
              </div>

              {/* Filters and Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 sm:pb-0">
                  <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5" />
                    <span>Filtrar:</span>
                  </span>
                  {(['todas', 'pendiente', 'confirmada', 'cancelada'] as const).map((filterKey) => (
                    <button
                      key={filterKey}
                      type="button"
                      onClick={() => setVisitFilter(filterKey)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                        visitFilter === filterKey
                          ? 'bg-[#001428] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {filterKey === 'todas'
                        ? 'Todas'
                        : filterKey === 'pendiente'
                        ? 'Pendientes'
                        : filterKey === 'confirmada'
                        ? 'Confirmadas'
                        : 'Canceladas'}
                    </button>
                  ))}
                </div>

                <div className="relative min-w-[220px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={visitSearch}
                    onChange={(e) => setVisitSearch(e.target.value)}
                    placeholder="Buscar escuela, nivel o responsable..."
                    className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>

              {/* Visits List */}
              <div className="space-y-3">
                {filteredVisits.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-500 space-y-2">
                    <Calendar className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-xs font-semibold">No se encontraron visitas escolares con el filtro seleccionado.</p>
                  </div>
                ) : (
                  filteredVisits.map((visit) => {
                    const isPendiente = visit.status === 'pendiente';
                    const isConfirmada = visit.status === 'confirmada' || visit.status === 'en_curso';
                    const isCancelada = visit.status === 'cancelada';

                    return (
                      <div
                        key={visit.id}
                        className={`p-4 rounded-xl border transition-all space-y-3 ${
                          isPendiente
                            ? 'bg-amber-50/40 border-amber-300 hover:border-amber-400'
                            : isCancelada
                            ? 'bg-rose-50/20 border-rose-200 hover:border-rose-300 opacity-90'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Status Badge */}
                              {isPendiente && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider shadow-2xs">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>Pendiente de Confirmación</span>
                                </span>
                              )}
                              {isConfirmada && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider shadow-2xs">
                                  <CheckCircle className="w-3 h-3" />
                                  <span>Confirmada</span>
                                </span>
                              )}
                              {isCancelada && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider shadow-2xs">
                                  <XCircle className="w-3 h-3" />
                                  <span>Cancelada</span>
                                </span>
                              )}

                              <span className="text-[11px] font-mono font-bold text-slate-600 bg-white/80 px-2 py-0.5 rounded border border-slate-200">
                                {visit.date} • {visit.startTime} a {visit.endTime} hs
                              </span>
                              <span className="text-[11px] font-bold text-[#0284c7]">
                                {visit.attendeesCount} participantes
                              </span>
                            </div>

                            <h4 className="text-sm font-extrabold text-[#001428] leading-tight">
                              {visit.title}
                            </h4>
                          </div>

                          {/* Quick Admin Actions on Row */}
                          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto flex-wrap">
                            {!isConfirmada && (
                              <button
                                type="button"
                                onClick={() => handleConfirmVisit(visit)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
                                title="Confirmar oficialmente la visita"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Confirmar</span>
                              </button>
                            )}

                            {!isCancelada && (
                              <button
                                type="button"
                                onClick={() => handleOpenCancelModal(visit)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-bold transition-colors cursor-pointer"
                                title="Cancelar la visita por inconveniente"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Cancelar</span>
                              </button>
                            )}

                            {isCancelada && (
                              <button
                                type="button"
                                onClick={() => handleReopenVisit(visit)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                                title="Reabrir visita a estado pendiente"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Reabrir</span>
                              </button>
                            )}

                            {onSyncEventToCalendar && (
                              <button
                                type="button"
                                onClick={() => onSyncEventToCalendar(visit)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-semibold cursor-pointer"
                                title="Agendar en Google Calendar"
                              >
                                <Calendar className="w-3.5 h-3.5 text-sky-600" />
                                <span className="hidden sm:inline">Calendar</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Details Info Bar */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-200/80 text-xs text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">
                              <strong>Inst:</strong> {visit.institution || 'Colegio / Escuela'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">
                              <strong>Lugar:</strong> {visit.location}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">
                              <strong>Resp:</strong> {visit.responsible}
                            </span>
                          </div>
                        </div>

                        {visit.notes && (
                          <div className="text-[11px] text-slate-600 bg-white/70 p-2 rounded border border-slate-200">
                            <strong>Notas / Docente:</strong> {visit.notes}
                          </div>
                        )}

                        {isCancelada && visit.cancellationReason && (
                          <div className="text-[11px] text-rose-800 bg-rose-50 p-2 rounded border border-rose-200 flex items-start gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <strong>Motivo de cancelación:</strong> {visit.cancellationReason}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ========================================================
              TAB: OBJETIVOS & BARRA DE CARGA
             ======================================================== */}
          {activeAdminTab === 'objetivos' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-extrabold text-[#001428] flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-[#0284c7]" />
                  <span>Configuración de Objetivos y Barra de Carga</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Establece si el objetivo es Anual o Mensual, qué indicador representará la barra de carga (Agentes formados o Visitas escolares) y ajusta los valores meta que se verán en toda la Intranet.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Form Controls */}
                <form onSubmit={handleSaveGoalSettings} className="lg:col-span-7 space-y-5 bg-slate-50/70 p-5 rounded-xl border border-slate-200">
                  {/* Period Selector: Anual vs Mensual */}
                  <div>
                    <label className="block text-xs font-bold text-[#001428] mb-2">
                      1. Período del Objetivo
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div
                        onClick={() => setGoalForm({ ...goalForm, period: 'anual' })}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          goalForm.period === 'anual'
                            ? 'bg-white border-[#0284c7] ring-2 ring-[#0284c7]/20 shadow-xs'
                            : 'bg-white/60 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-xs text-[#001428]">Objetivo Anual</span>
                          {goalForm.period === 'anual' && <Check className="w-4 h-4 text-[#0284c7]" />}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Calcula el acumulado anual de gestión del Ciclo Parlamentario 2026.
                        </p>
                      </div>

                      <div
                        onClick={() => setGoalForm({ ...goalForm, period: 'mensual' })}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          goalForm.period === 'mensual'
                            ? 'bg-white border-[#0284c7] ring-2 ring-[#0284c7]/20 shadow-xs'
                            : 'bg-white/60 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-xs text-[#001428]">Objetivo Mensual</span>
                          {goalForm.period === 'mensual' && <Check className="w-4 h-4 text-[#0284c7]" />}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Monitorea la meta operativa correspondiente al mes en curso.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Metric Type Selector */}
                  <div>
                    <label className="block text-xs font-bold text-[#001428] mb-1.5">
                      2. Indicador a Representar en la Barra de Carga (Página de Inicio)
                    </label>
                    <p className="text-[11px] text-slate-500 mb-2.5">
                      Elige qué meta institucional se mostrará de forma exclusiva en la barra de progreso de la página principal. Los usuarios verán únicamente el indicador que decidas aquí.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div
                        onClick={() => setGoalForm({ ...goalForm, metricType: 'agentes' })}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          goalForm.metricType === 'agentes'
                            ? 'bg-blue-50/60 border-[#0284c7] ring-2 ring-[#0284c7]/20 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <GraduationCap className="w-4 h-4 text-[#0284c7]" />
                            <span className="font-extrabold text-xs text-[#001428]">Agentes Formados</span>
                          </div>
                          {goalForm.metricType === 'agentes' && <Check className="w-4 h-4 text-[#0284c7]" />}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                          La barra de carga mostrará el avance sobre la meta de agentes legislativos y públicos capacitados.
                        </p>
                      </div>

                      <div
                        onClick={() => setGoalForm({ ...goalForm, metricType: 'visitas' })}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          goalForm.metricType === 'visitas'
                            ? 'bg-blue-50/60 border-[#0284c7] ring-2 ring-[#0284c7]/20 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-[#0284c7]" />
                            <span className="font-extrabold text-xs text-[#001428]">Visitas Escolares</span>
                          </div>
                          {goalForm.metricType === 'visitas' && <Check className="w-4 h-4 text-[#0284c7]" />}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                          La barra de carga mostrará el avance sobre la meta de contingentes y visitas escolares recibidas y confirmadas.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Target Values Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                    <div>
                      <label className="block text-xs font-bold text-[#001428] mb-1">
                        Meta de Agentes Formados ({goalForm.period === 'anual' ? 'Anual' : 'Mensual'})
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={goalForm.targetAgentes}
                        onChange={(e) => setGoalForm({ ...goalForm, targetAgentes: Number(e.target.value) || 1 })}
                        className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                        placeholder="Ej: 1750"
                      />
                      <span className="text-[10px] text-slate-500 block mt-1">
                        Cantidad objetivo de capacitados requerida para 100%.
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#001428] mb-1">
                        Meta de Visitas Escolares ({goalForm.period === 'anual' ? 'Anual' : 'Mensual'})
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={goalForm.targetVisitas}
                        onChange={(e) => setGoalForm({ ...goalForm, targetVisitas: Number(e.target.value) || 1 })}
                        className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                        placeholder="Ej: 35"
                      />
                      <span className="text-[10px] text-slate-500 block mt-1">
                        Cantidad de escuelas y contingentes confirmados meta.
                      </span>
                    </div>
                  </div>

                  {/* Form Actions */}
                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={handleResetGoalSettings}
                      className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                    >
                      Restablecer Predeterminado
                    </button>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#001428] hover:bg-[#122a45] text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
                    >
                      <Save className="w-3.5 h-3.5 text-sky-400" />
                      <span>Guardar Objetivos</span>
                    </button>
                  </div>
                </form>

                {/* Live Preview Card */}
                <div className="lg:col-span-5 space-y-3">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Previsualización en Vivo (Página de Inicio)</span>
                  </div>

                  <div className="bg-[#0a1c30] text-white rounded-xl p-5 shadow-md border border-slate-800 space-y-4">
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span className="uppercase tracking-wider font-extrabold text-[10px] text-sky-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        GESTIÓN {new Date().getFullYear()} • EN VIVO
                      </span>
                      <BarChart3 className="w-4 h-4 text-sky-400" />
                    </div>

                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-white tracking-tight">
                        Métricas de Gestión
                      </h3>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-semibold border border-slate-700">
                        {goalForm.period === 'anual' ? 'Objetivo Anual' : 'Objetivo Mensual'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-center pt-1 border-t border-slate-800">
                      <div className="p-2 bg-slate-900/60 rounded border border-slate-800">
                        <div className="text-xl font-black text-white">
                          {liveAgentesFormados.toLocaleString('es-AR')}
                        </div>
                        <div className="text-[10px] text-slate-300 mt-0.5">Agentes formados</div>
                        <div className="text-[9px] text-slate-400">Meta: {goalForm.targetAgentes.toLocaleString('es-AR')}</div>
                      </div>
                      <div className="p-2 bg-slate-900/60 rounded border border-slate-800">
                        <div className="text-xl font-black text-white">
                          {liveVisitasConfirmadas}
                        </div>
                        <div className="text-[10px] text-slate-300 mt-0.5">Visitas confirmadas</div>
                        <div className="text-[9px] text-slate-400">Meta: {goalForm.targetVisitas} visitas</div>
                      </div>
                    </div>

                    {/* Progress Bar Preview */}
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <div className="flex justify-between text-[11px] text-slate-300">
                        <span>
                          Objetivo {goalForm.period === 'anual' ? 'Anual' : 'Mensual'} (
                          <strong className="text-white">
                            {goalForm.metricType === 'visitas'
                              ? `${goalForm.targetVisitas} visitas`
                              : `${goalForm.targetAgentes.toLocaleString('es-AR')} agentes`}
                          </strong>
                          )
                        </span>
                        <span className="font-bold text-sky-400">{liveGoalPct}% cumplido</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-700">
                        <div
                          className="bg-gradient-to-r from-sky-400 to-emerald-400 h-full rounded-full transition-all duration-500 ease-out"
                          style={{ width: `${liveGoalPct}%` }}
                        ></div>
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center justify-between">
                        <span>
                          {goalForm.metricType === 'visitas'
                            ? `${liveVisitasConfirmadas} de ${goalForm.targetVisitas} visitas realizadas`
                            : `${liveAgentesFormados.toLocaleString('es-AR')} de ${goalForm.targetAgentes.toLocaleString('es-AR')} capacitados`}
                        </span>
                        <span className="text-sky-300 font-semibold">{liveGoalPct}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              TAB: AUDITORÍA DE CURSOS Y CONTROL DE LECTURA (CHECKLISTS)
             ======================================================== */}
          {activeAdminTab === 'auditoria_cursos' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-extrabold text-[#001428] flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-[#0284c7]" />
                    <span>Auditoría de Cursada y Control de Lectura en Drive</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 max-w-3xl leading-relaxed">
                    Monitoreo en tiempo real del progreso de lectura de los agentes. Cada check registra fecha y hora exacta. El sistema audita automáticamente si los módulos se completaron de forma progresiva o si se marcaron todos juntos simultáneamente en cursos extensos (ej. 32 hs).
                  </p>
                </div>
              </div>

              {/* Status Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div
                  onClick={() => setAuditFilter('todos')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    auditFilter === 'todos'
                      ? 'bg-blue-50/70 border-[#0284c7] ring-1 ring-[#0284c7]'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    Total Cursantes
                  </div>
                  <div className="text-2xl font-black text-[#001428] mt-1">{courseAudits.length}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Agentes con seguimiento</div>
                </div>

                <div
                  onClick={() => setAuditFilter('alertas')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    auditFilter === 'alertas'
                      ? 'bg-rose-50/80 border-rose-500 ring-1 ring-rose-500'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700 flex items-center gap-1">
                    {simultaneousAlertsCount > 0 && (
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                    )}
                    <span>Alertas Simultáneas</span>
                  </div>
                  <div className="text-2xl font-black text-rose-900 mt-1">{simultaneousAlertsCount}</div>
                  <div className="text-[10px] text-rose-700 font-semibold mt-0.5">
                    Checks en pocos segundos
                  </div>
                </div>

                <div
                  onClick={() => setAuditFilter('consistentes')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    auditFilter === 'consistentes'
                      ? 'bg-emerald-50/70 border-emerald-500 ring-1 ring-emerald-500'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                    Cursadas Regulares
                  </div>
                  <div className="text-2xl font-black text-emerald-900 mt-1">{consistentCount}</div>
                  <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                    Intervalos espaciados
                  </div>
                </div>

                <div
                  onClick={() => setAuditFilter('aprobados')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    auditFilter === 'aprobados'
                      ? 'bg-blue-50/70 border-sky-500 ring-1 ring-sky-500'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0284c7]">
                    Certificados Aprobados
                  </div>
                  <div className="text-2xl font-black text-[#001428] mt-1">{approvedAuditsCount}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Validados por el Panel</div>
                </div>
              </div>

              {/* Resumen Oficial de Índice CSAT */}
              {(() => {
                const csat = getCourseCsatStats();
                return (
                  <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100/80 border border-emerald-300 flex items-center justify-center text-emerald-800 shrink-0">
                        <Star className="w-4 h-4 text-emerald-700 fill-emerald-700" />
                      </div>
                      <div>
                        <div className="font-bold text-[#001428] flex items-center gap-2">
                          <span>Índice de Satisfacción CSAT de Egresados</span>
                          <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                            {csat.hasData ? `${csat.csatPercentage}% Positivo` : 'Sin encuestas'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {csat.totalEvaluations} encuestas auditadas • {csat.positiveCount} agentes satisfechos o muy satisfechos • Promedio {csat.hasData ? csat.averageRating5 : '—'} / 5.0
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-[11px]">
                      <span className="text-slate-600 font-medium">Muy satisfechos: <strong className="text-slate-800">{csat.distribution.muySatisfecho}</strong></span>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-600 font-medium">Satisfechos: <strong className="text-slate-800">{csat.distribution.satisfecho}</strong></span>
                      {csat.distribution.neutral > 0 && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="text-slate-600 font-medium">Neutros: <strong className="text-slate-800">{csat.distribution.neutral}</strong></span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Filters and Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 sm:pb-0">
                  <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5" />
                    <span>Filtrar:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setAuditFilter('todos')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      auditFilter === 'todos'
                        ? 'bg-[#001428] text-white shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    Todos ({courseAudits.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuditFilter('alertas')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                      auditFilter === 'alertas'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Alertas Simultáneas ({simultaneousAlertsCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuditFilter('consistentes')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      auditFilter === 'consistentes'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                    }`}
                  >
                    Consistentes ({consistentCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuditFilter('aprobados')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      auditFilter === 'aprobados'
                        ? 'bg-[#0284c7] text-white shadow-2xs'
                        : 'bg-blue-50 text-[#0284c7] hover:bg-blue-100 border border-blue-200'
                    }`}
                  >
                    Aprobados ({approvedAuditsCount})
                  </button>
                </div>

                <div className="relative min-w-[260px]">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Buscar por agente, correo o curso..."
                    className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0284c7] focus:bg-white text-slate-800"
                  />
                  {auditSearch && (
                    <button
                      type="button"
                      onClick={() => setAuditSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* List of Audits */}
              <div className="space-y-4 pt-1">
                {filteredAudits.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <CheckCircle className="w-8 h-8 text-slate-400 mx-auto" />
                    <div className="text-sm font-bold text-[#001428]">No se encontraron cursantes</div>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      No hay registros de seguimiento que coincidan con los filtros aplicados.
                    </p>
                  </div>
                ) : (
                  filteredAudits.map((audit) => {
                    const isAlert = audit.auditStatus === 'alerta_simultanea';
                    const isApproved = audit.auditStatus === 'aprobado_admin';
                    const isObserved = audit.auditStatus === 'observado';
                    const progressPct = Math.round(
                      (audit.completedModulesCount / Math.max(1, audit.totalModules)) * 100
                    );

                    return (
                      <div
                        key={audit.id}
                        className={`p-5 rounded-xl border transition-all ${
                          isAlert
                            ? 'bg-rose-50/40 border-rose-300 ring-1 ring-rose-300'
                            : isApproved
                            ? 'bg-white border-emerald-300'
                            : isObserved
                            ? 'bg-amber-50/40 border-amber-300'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        } shadow-xs space-y-4`}
                      >
                        {/* Header: Agent and Course info */}
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-slate-100">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-extrabold text-[#001428]">{audit.agentName}</h4>
                              <span className="text-[10px] text-slate-500 font-medium">{audit.agentEmail}</span>
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold border border-slate-200">
                                {audit.agentArea}
                              </span>
                            </div>
                            <div className="text-xs font-bold text-[#0284c7] mt-1 flex items-center gap-1.5">
                              <GraduationCap className="w-3.5 h-3.5" />
                              <span>{audit.courseTitle}</span>
                              <span className="text-slate-400 font-normal">• Carga: {audit.durationHours} hs</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                            {isAlert ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-extrabold border border-rose-300 animate-pulse">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                                <span>ALERTA: Checks Simultáneos</span>
                              </span>
                            ) : isApproved ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Certificado Homologado</span>
                              </span>
                            ) : isObserved ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold border border-amber-300">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                <span>Observado por Administración</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-[#0284c7] text-xs font-bold border border-blue-200">
                                <Clock className="w-3.5 h-3.5" />
                                <span>{audit.auditStatus === 'en_progreso' ? 'En Cursada' : 'Lectura Regular'}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Progress and Timeline */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-xs text-slate-600">
                            <span>
                              Avance de lectura:{' '}
                              <strong className="text-[#001428]">
                                {audit.completedModulesCount} de {audit.totalModules} módulos ({progressPct}%)
                              </strong>
                            </span>
                            {audit.checks.length > 1 && (
                              <span className="text-[11px] font-semibold text-slate-500">
                                Intervalo total entre módulos:{' '}
                                <strong className={isAlert ? 'text-rose-700 font-extrabold' : 'text-[#001428]'}>
                                  {audit.timeDeltaMinutes < 1
                                    ? 'Menos de 1 minuto (Simultáneo)'
                                    : audit.timeDeltaMinutes < 60
                                    ? `${audit.timeDeltaMinutes} minutos`
                                    : `${Math.round(audit.timeDeltaMinutes / 60)} horas (${(
                                        audit.timeDeltaMinutes / 1440
                                      ).toFixed(1)} días)`}
                                </strong>
                              </span>
                            )}
                          </div>

                          {/* Check timestamps breakdown */}
                          <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-200 space-y-2">
                            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                              <span>Marcas de Tiempo Auditadas (Checklist Coursera-Style)</span>
                              <span>Fecha y Hora de Registro</span>
                            </div>

                            <div className="space-y-1.5">
                              {audit.checks.length === 0 ? (
                                <div className="text-xs text-slate-400 italic">No ha marcado módulos aún.</div>
                              ) : (
                                audit.checks.map((check, idx) => {
                                  const prevCheck = idx > 0 ? audit.checks[idx - 1] : null;
                                  const diffSeconds = prevCheck
                                    ? Math.round((check.timestamp - prevCheck.timestamp) / 1000)
                                    : null;

                                  return (
                                    <div
                                      key={idx}
                                      className="flex items-center justify-between text-xs py-1 px-2 bg-white rounded border border-slate-200"
                                    >
                                      <div className="flex items-center gap-2 truncate max-w-md">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                        <span className="font-semibold text-[#001428] truncate">{check.unitTitle}</span>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        {diffSeconds !== null && (
                                          <span
                                            className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                                              diffSeconds < 60
                                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            }`}
                                          >
                                            +{diffSeconds < 60 ? `${diffSeconds}s` : `${Math.round(diffSeconds / 60)}m`}
                                          </span>
                                        )}
                                        <span className="text-[11px] font-mono text-slate-600">{check.completedAt}</span>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>

                          {/* Verdict Box */}
                          <div
                            className={`p-3 rounded-lg border text-xs leading-relaxed flex items-start gap-2.5 ${
                              isAlert
                                ? 'bg-rose-100/60 border-rose-300 text-rose-950 font-semibold'
                                : isApproved
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                                : isObserved
                                ? 'bg-amber-50 border-amber-200 text-amber-950'
                                : 'bg-slate-100/80 border-slate-200 text-slate-700'
                            }`}
                          >
                            {isAlert ? (
                              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                            ) : isApproved ? (
                              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            ) : isObserved ? (
                              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            ) : (
                              <Clock className="w-4 h-4 text-[#0284c7] shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1">
                              <div>{audit.auditVerdict.replace(/^[✅⚠️⏳]\s*/, '')}</div>
                              {audit.adminNotes && (
                                <div className="text-[11px] text-slate-500 mt-1 font-normal">
                                  <strong>Nota del Administrador:</strong> {audit.adminNotes}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* CSAT Rating display */}
                          {audit.csatRating && (
                            <div className="flex items-center gap-2 text-xs text-slate-700 bg-blue-50/50 p-2.5 rounded-lg border border-blue-100">
                              <Star className="w-4 h-4 text-amber-500 fill-amber-500 shrink-0" />
                              <span>
                                <strong>Encuesta CSAT:</strong> {audit.csatRating}{' '}
                                {audit.csatComment ? `(«${audit.csatComment}»)` : ''}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Actions for Administrator */}
                        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                          {isAlert && !isObserved && (
                            <button
                              type="button"
                              onClick={() => handleObserveAudit(audit.id)}
                              className="px-3.5 py-1.5 rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 text-xs font-bold transition-colors cursor-pointer"
                            >
                              Observar Cursada
                            </button>
                          )}
                          {isApproved && (
                            <button
                              type="button"
                              onClick={() => handleObserveAudit(audit.id)}
                              className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white hover:bg-amber-50 text-amber-800 text-xs font-bold transition-colors cursor-pointer"
                              title="Revocar aprobación y marcar como observada"
                            >
                              Revocar / Observar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleResetAudit(audit.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                            title="Reiniciar módulos de lectura y certificación del agente"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                            <span>Reiniciar Cursada</span>
                          </button>
                          {!isApproved && (
                            (audit.isFullyCompleted || audit.completedModulesCount >= audit.totalModules) ? (
                              <button
                                type="button"
                                onClick={() => handleApproveAudit(audit.id)}
                                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#001428] hover:bg-[#122a45] text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
                              >
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Homologar y Emitir Certificado</span>
                              </button>
                            ) : (
                              <div
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-xs font-semibold border border-slate-200"
                                title={`El agente completó ${audit.completedModulesCount} de ${audit.totalModules} módulos. Requiere el 100% para homologar y emitir certificado.`}
                              >
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                <span>Cursada en progreso ({audit.completedModulesCount}/{audit.totalModules} módulos)</span>
                              </div>
                            )
                          )}
                          {isApproved && (
                            <div className="text-xs text-emerald-700 font-bold flex items-center gap-1 px-2.5 py-1 bg-emerald-50 rounded border border-emerald-200">
                              <Award className="w-4 h-4 text-emerald-600" />
                              <span>Acreditado Oficial</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
          {activeAdminTab === 'cards_instituto' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-extrabold text-[#001428] flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-[#0284c7]" />
                    <span>Personalización y Orden de Cards del Instituto</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Modifica el texto, rol, etiqueta e ícono de cada card de área, y elige libremente qué posición ocupará cada una (primera, segunda, última).
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setIsResetAreasConfirmOpen(true)}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                    <span>Restablecer Orden</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingArea(null);
                      setIsCreatingArea(true);
                    }}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 sm:py-1.5 rounded-lg bg-[#001428] hover:bg-[#122a45] text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-sky-400" />
                    <span>Nueva Área</span>
                  </button>
                </div>
              </div>

              {/* Cards List with drag-and-drop reordering & mobile tap controls */}
              <Reorder.Group
                axis="y"
                values={areas}
                onReorder={handleReorderAreas}
                className="space-y-3"
              >
                {areas.map((area, index) => (
                  <DraggableAreaCardItem
                    key={area.id}
                    area={area}
                    index={index}
                    total={areas.length}
                    onEdit={() => {
                      setIsCreatingArea(false);
                      setEditingArea(area);
                    }}
                    onDelete={() => handleDeleteAreaCard(area)}
                    onMoveUp={index > 0 ? () => handleMoveAreaPosition(area.id, index) : undefined}
                    onMoveDown={index < areas.length - 1 ? () => handleMoveAreaPosition(area.id, index + 2) : undefined}
                  />
                ))}
              </Reorder.Group>

              {/* Bottom Sheet Drawer for Editing or Creating an Area Card */}
              {isAreaModalOpen && (
                <div
                  onClick={(e) => {
                    if (e.target === e.currentTarget) handleCloseAreaModal();
                  }}
                  className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden sm:overflow-y-auto overscroll-none"
                >
                  <div
                    data-bottom-sheet="true"
                    style={areaSheet.sheetStyle}
                    className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain h-[88dvh] sm:h-auto sm:max-h-[90vh] flex flex-col animate-in fade-in sm:zoom-in-95 duration-200"
                  >
                    <BottomSheetHandle
                      {...areaSheet.dragBind}
                      isExpanded={areaSheet.isExpanded}
                      isDragging={areaSheet.isDragging}
                    />

                    <div
                      {...areaSheet.dragBind}
                      className="p-4 sm:p-6 pb-3 sm:pb-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 select-none touch-none sm:touch-auto cursor-grab active:cursor-grabbing sm:cursor-default"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Building2 className="w-5 h-5 text-[#001428] shrink-0" />
                        <div className="min-w-0">
                          <h3 className="text-sm sm:text-base font-bold text-[#001428] tracking-tight truncate">
                            {isCreatingArea ? 'Nueva Área del Instituto' : `Editar: ${editingArea?.title || 'Área'}`}
                          </h3>
                          <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                            {isCreatingArea
                              ? 'Crear una nueva card de área institucional'
                              : 'Personalizar contenido, rol, etiqueta e ícono'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleCloseAreaModal}
                        className="flex text-slate-400 hover:text-slate-800 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ml-2"
                        title="Cerrar ventana"
                        aria-label="Cerrar ventana"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4">
                      <AreaCardForm
                        initialData={editingArea}
                        totalAreas={areas.length}
                        onSave={handleSaveAreaCard}
                        onCancel={handleCloseAreaModal}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================
              TAB: DATOS INSTITUCIONALES (CONFIGURACIÓN Y FOOTER)
             ======================================================== */}
          {activeAdminTab === 'institucional' && (
            <form onSubmit={handleSaveSettings} className="space-y-6">
              {/* Encabezado y Acciones Rápidas */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <h3 className="text-sm font-bold text-[#001428] flex items-center gap-2">
                    <Settings className="w-4 h-4 text-[#0284c7]" />
                    <span>Edición de Identidad y Contacto del Instituto</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Los datos configurados aquí impactan directamente en el pie de página (footer), la sección Instituto y los documentos y reportes oficiales en PDF generados en la Intranet.
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setIsResetSettingsConfirmOpen(true)}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restaurar</span>
                  </button>
                  <button
                    type="submit"
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#001428] hover:bg-[#122a45] text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-[0.98]"
                  >
                    <Save className="w-3.5 h-3.5 text-sky-400" />
                    <span>Guardar Cambios</span>
                  </button>
                </div>
              </div>

              {/* Mensaje de Confirmación Inmediato dentro de la pestaña */}
              {settingsSavedMessage && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs font-semibold flex items-center justify-between gap-2 shadow-2xs animate-in fade-in">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{settingsSavedMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettingsSavedMessage(null)}
                    className="p-1 hover:bg-emerald-100 rounded text-emerald-700 transition-colors cursor-pointer"
                    aria-label="Cerrar notificación"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Grupos de Campos del Formulario */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Bloque 1: Identidad */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3.5">
                  <div className="text-xs font-bold text-[#001428] flex items-center gap-1.5 pb-2 border-b border-slate-200">
                    <Building2 className="w-3.5 h-3.5 text-[#0284c7]" />
                    <span>1. Identidad Institucional</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#001428] mb-1">
                      Nombre Oficial de la Institución
                    </label>
                    <input
                      type="text"
                      value={settings.instituteName}
                      onChange={(e) => setSettings({ ...settings, instituteName: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                      placeholder="Instituto de Capacitación y Gestión Pública"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#001428] mb-1">
                      Poder o Dependencia Jerárquica
                    </label>
                    <input
                      type="text"
                      value={settings.institutionSubtitle}
                      onChange={(e) => setSettings({ ...settings, institutionSubtitle: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                      placeholder="Poder Legislativo"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#001428] mb-1">
                      Descripción Resumida para el Pie de Página
                    </label>
                    <textarea
                      rows={2}
                      value={settings.description || ''}
                      onChange={(e) => setSettings({ ...settings, description: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none resize-none"
                      placeholder="Plataforma de coordinación pedagógica, extensión cívica y administración de expedientes formativos..."
                    />
                  </div>
                </div>

                {/* Bloque 2: Sede y Horarios */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3.5">
                  <div className="text-xs font-bold text-[#001428] flex items-center gap-1.5 pb-2 border-b border-slate-200">
                    <MapPin className="w-3.5 h-3.5 text-[#0284c7]" />
                    <span>2. Sede y Horarios de Atención</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#001428] mb-1">
                      Dirección Edilicia / Sede
                    </label>
                    <input
                      type="text"
                      value={settings.address}
                      onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                      placeholder="Palacio Legislativo - Anexo Rivadavia, Av. Rivadavia 1864, Piso 3°"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#001428] mb-1">
                      Ciudad / Jurisdicción
                    </label>
                    <input
                      type="text"
                      value={settings.city || ''}
                      onChange={(e) => setSettings({ ...settings, city: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                      placeholder="Ciudad Autónoma de Buenos Aires"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#001428] mb-1">
                      Horario de Atención al Público
                    </label>
                    <input
                      type="text"
                      value={settings.operatingHours}
                      onChange={(e) => setSettings({ ...settings, operatingHours: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                      placeholder="Lunes a Viernes de 08:00 a 18:00 hs"
                    />
                  </div>
                </div>

                {/* Bloque 3: Canales de Contacto */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3.5">
                  <div className="text-xs font-bold text-[#001428] flex items-center gap-1.5 pb-2 border-b border-slate-200">
                    <Phone className="w-3.5 h-3.5 text-[#0284c7]" />
                    <span>3. Canales de Contacto y Telefonía</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#001428] mb-1">
                      Correo Electrónico Oficial de Contacto
                    </label>
                    <input
                      type="text"
                      value={settings.contactEmail}
                      onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                      placeholder="contacto@instituto.legislatura.gob.ar"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#001428] mb-1">
                      Teléfono / Conmutador General (Opcional)
                    </label>
                    <input
                      type="text"
                      value={settings.phone || ''}
                      onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                      placeholder="Conmutador: (011) 4370-7100"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#001428] mb-1">
                        Interno Mesa de Entradas
                      </label>
                      <input
                        type="text"
                        value={settings.receptionExtension}
                        onChange={(e) => setSettings({ ...settings, receptionExtension: e.target.value })}
                        className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                        placeholder="int. 4022"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#001428] mb-1">
                        Interno Soporte Informático
                      </label>
                      <input
                        type="text"
                        value={settings.techSupportExtension}
                        onChange={(e) => setSettings({ ...settings, techSupportExtension: e.target.value })}
                        className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                        placeholder="int. 4108"
                      />
                    </div>
                  </div>
                </div>

                {/* Bloque 4: Avisos y Copyright */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3.5">
                  <div className="text-xs font-bold text-[#001428] flex items-center gap-1.5 pb-2 border-b border-slate-200">
                    <BellRing className="w-3.5 h-3.5 text-[#0284c7]" />
                    <span>4. Pie de Página y Avisos Institucionales</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#001428] mb-1">
                      Leyenda de Copyright en Pie de Página
                    </label>
                    <input
                      type="text"
                      value={settings.copyrightText || ''}
                      onChange={(e) => setSettings({ ...settings, copyrightText: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                      placeholder="Todos los derechos reservados."
                    />
                  </div>

                  {/* Interruptor y Selector de Aviso Interno de Novedades */}
                  <div className="p-3 sm:p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                    {/* Encabezado: Título con ícono a la izquierda y Switch a la derecha */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0 text-[#0284c7]">
                          <Megaphone className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs sm:text-sm font-bold text-[#001428] truncate">
                          Aviso Interno de Novedades
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, isAnnouncementActive: !settings.isAnnouncementActive })}
                        className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 shadow-2xs ${
                          settings.isAnnouncementActive
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        }`}
                      >
                        {settings.isAnnouncementActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                        <span>{settings.isAnnouncementActive ? 'Activo' : 'Desactivado'}</span>
                      </button>
                    </div>

                    {/* Descripción a ancho completo (sin comprimirse horizontalmente en móviles) */}
                    <p className="text-[11px] sm:text-xs text-slate-500 leading-relaxed">
                      Controla si se muestra el banner de Aviso Interno (megáfono) en la portada principal. Solo actívalo o desactívalo.
                    </p>

                    {/* Selector y Previsualización informativa del comunicado vinculado */}
                    <div className="p-2.5 sm:p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                          Comunicado en Aviso
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          settings.isAnnouncementActive
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-200 text-slate-600'
                        }`}>
                          {settings.isAnnouncementActive ? '● Visible en portada' : '○ En pausa'}
                        </span>
                      </div>

                      {news && news.length > 0 ? (
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-600 block">
                            Seleccionar comunicado (solo uno activo):
                          </label>
                          <select
                            value={news.find((n) => n.isAnnouncement)?.id || news[0]?.id || ''}
                            onChange={(e) => onSetAnnouncementNewsId?.(e.target.value || null)}
                            className="w-full text-xs py-2 px-2.5 rounded-lg border border-slate-300 bg-white font-medium text-[#001428] focus:ring-1 focus:ring-[#0284c7] focus:outline-none truncate"
                          >
                            {news.map((item) => (
                              <option key={item.id} value={item.id}>
                                [{item.category}] {item.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="text-slate-400 text-xs italic">No hay novedades registradas en el sistema.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bloque 5: Pilares Institucionales de la sección Instituto */}
              <div className="p-4 sm:p-5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-[#0284c7]" />
                    <h4 className="text-xs font-bold text-[#001428]">
                      5. Pilares Institucionales (Las 3 Tarjetas de la Sección Instituto)
                    </h4>
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Edita el contenido estratégico visible en las cards de la pestaña Instituto
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Sub-Card 1: Misión Institucional */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 shadow-2xs flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#001428] pb-1.5 border-b border-slate-100">
                        <Compass className="w-3.5 h-3.5 text-[#0284c7]" />
                        <span>Tarjeta 1: Misión Institucional</span>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Categoría / Etiqueta Superior
                        </label>
                        <input
                          type="text"
                          value={settings.missionTag || ''}
                          onChange={(e) => setSettings({ ...settings, missionTag: e.target.value })}
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                          placeholder="PROPÓSITO PERMANENTE"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Título de la Card
                        </label>
                        <input
                          type="text"
                          value={settings.missionTitle || ''}
                          onChange={(e) => setSettings({ ...settings, missionTitle: e.target.value })}
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                          placeholder="Misión Institucional"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Texto Explicativo de la Misión
                        </label>
                        <textarea
                          rows={4}
                          value={settings.missionText || ''}
                          onChange={(e) => setSettings({ ...settings, missionText: e.target.value })}
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none resize-none leading-relaxed"
                          placeholder="Capacitar, profesionalizar y brindar asistencia técnica..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Sub-Card 2: Objetivos de Gestión */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 shadow-2xs flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#001428] pb-1.5 border-b border-slate-100">
                        <Target className="w-3.5 h-3.5 text-[#0284c7]" />
                        <span>Tarjeta 2: Objetivos de Gestión</span>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Categoría / Etiqueta Superior
                        </label>
                        <input
                          type="text"
                          value={settings.objectivesTag || ''}
                          onChange={(e) => setSettings({ ...settings, objectivesTag: e.target.value })}
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                          placeholder="METAS ESTRATÉGICAS"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Título de la Card
                        </label>
                        <input
                          type="text"
                          value={settings.objectivesTitle || ''}
                          onChange={(e) => setSettings({ ...settings, objectivesTitle: e.target.value })}
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                          placeholder="Objetivos de Gestión"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-[11px] font-bold text-slate-700">
                            Lista de Objetivos
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const currentList = settings.objectivesList || [];
                              setSettings({
                                ...settings,
                                objectivesList: [...currentList, 'Nuevo objetivo de gestión'],
                              });
                            }}
                            className="text-[10px] font-bold text-[#0284c7] hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Agregar</span>
                          </button>
                        </div>

                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {(settings.objectivesList || []).map((obj, idx) => (
                            <div key={idx} className="flex items-center gap-1.5">
                              <span className="text-[11px] font-bold text-slate-400 shrink-0 w-4 text-center">
                                {idx + 1}.
                              </span>
                              <input
                                type="text"
                                value={obj}
                                onChange={(e) => {
                                  const updated = [...(settings.objectivesList || [])];
                                  updated[idx] = e.target.value;
                                  setSettings({ ...settings, objectivesList: updated });
                                }}
                                className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                              />
                              {(settings.objectivesList || []).length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (settings.objectivesList || []).filter((_, i) => i !== idx);
                                    setSettings({ ...settings, objectivesList: updated });
                                  }}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                                  title="Eliminar objetivo"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sub-Card 3: Principios Rectores */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 shadow-2xs flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#001428] pb-1.5 border-b border-slate-100">
                        <Shield className="w-3.5 h-3.5 text-[#0284c7]" />
                        <span>Tarjeta 3: Principios Rectores</span>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Categoría / Etiqueta Superior
                        </label>
                        <input
                          type="text"
                          value={settings.principlesTag || ''}
                          onChange={(e) => setSettings({ ...settings, principlesTag: e.target.value })}
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                          placeholder="MARCO ÉTICO"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Título de la Card
                        </label>
                        <input
                          type="text"
                          value={settings.principlesTitle || ''}
                          onChange={(e) => setSettings({ ...settings, principlesTitle: e.target.value })}
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                          placeholder="Principios Rectores"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-[11px] font-bold text-slate-700">
                            Principios y Fundamentos
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const currentList = settings.principlesList || [];
                              setSettings({
                                ...settings,
                                principlesList: [
                                  ...currentList,
                                  { title: 'Nuevo Principio', desc: 'Descripción del principio ético e institucional.' },
                                ],
                              });
                            }}
                            className="text-[10px] font-bold text-[#0284c7] hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Agregar</span>
                          </button>
                        </div>

                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {(settings.principlesList || []).map((p, idx) => (
                            <div key={idx} className="p-2 rounded-lg border border-slate-200 bg-slate-50 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <input
                                  type="text"
                                  value={p.title}
                                  onChange={(e) => {
                                    const updated = [...(settings.principlesList || [])];
                                    updated[idx] = { ...updated[idx], title: e.target.value };
                                    setSettings({ ...settings, principlesList: updated });
                                  }}
                                  placeholder="Título del principio (ej. Pluralismo)"
                                  className="flex-1 text-xs font-bold px-2 py-1 rounded border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                                />
                                {(settings.principlesList || []).length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = (settings.principlesList || []).filter((_, i) => i !== idx);
                                      setSettings({ ...settings, principlesList: updated });
                                    }}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-200 transition-colors cursor-pointer shrink-0"
                                    title="Eliminar principio"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              <input
                                type="text"
                                value={p.desc}
                                onChange={(e) => {
                                  const updated = [...(settings.principlesList || [])];
                                  updated[idx] = { ...updated[idx], desc: e.target.value };
                                  setSettings({ ...settings, principlesList: updated });
                                }}
                                placeholder="Fundamento o descripción breve"
                                className="w-full text-[11px] px-2 py-1 rounded border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Barra Inferior de Guardado con Feedback Inmediato */}
              <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200">
                <div className="text-[11px] text-slate-500">
                  {settingsSavedMessage ? (
                    <span className="text-emerald-700 font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {settingsSavedMessage}
                    </span>
                  ) : (
                    <span>Presiona <strong>Guardar Configuración</strong> para impactar los cambios inmediatamente en la sección Instituto, el footer y los reportes oficiales.</span>
                  )}
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setIsResetSettingsConfirmOpen(true)}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restaurar Predeterminado</span>
                  </button>
                  <button
                    type="submit"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2 bg-[#001428] hover:bg-[#122a45] text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-[0.98]"
                  >
                    <Save className="w-3.5 h-3.5 text-sky-400" />
                    <span>Guardar Configuración</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* ========================================================
              TAB: ACREDITACIONES Y ACCESOS (EXISTENTE PRESERVADO)
             ======================================================== */}
          {activeAdminTab === 'usuarios' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <h3 className="text-sm font-bold text-[#001428] flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#0284c7]" />
                    <span>Control de Acceso y Acreditaciones de Usuarios</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Define la política de aprobación de nuevos usuarios que ingresen con Google o credenciales institucionales.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenUserManagement}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#001428] hover:bg-[#122a45] text-white text-xs font-bold transition-colors cursor-pointer shadow-xs shrink-0"
                >
                  <Users className="w-3.5 h-3.5 text-sky-400" />
                  <span>Abrir Gestor Completo de Usuarios</span>
                </button>
              </div>

              {/* Policy Selector Card */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-[#001428]">Política de Nuevos Ingresos</div>
                    <div className="text-xs text-slate-500">
                      Modo actual:{' '}
                      <strong className={approvalModeState === 'manual' ? 'text-amber-700' : 'text-emerald-700'}>
                        {approvalModeState === 'manual'
                          ? 'Aprobación Manual Estricta (Recomendado)'
                          : 'Aprobación Automática (Visitante)'}
                      </strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleApprovalMode}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-[#001428] transition-colors cursor-pointer shadow-2xs"
                  >
                    <span>Cambiar a {approvalModeState === 'manual' ? 'Automático' : 'Manual'}</span>
                  </button>
                </div>
              </div>

              {/* Users summary list */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Listado de Usuarios Registrados ({authorizedUsers.length})
                </div>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden bg-white">
                  {authorizedUsers.slice(0, 6).map((u) => (
                    <div key={u.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="font-bold text-[#001428] truncate">{u.displayName}</div>
                        <div className="text-slate-500 text-[11px] truncate">{u.email}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                          u.role === 'administrador'
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-blue-100 text-blue-900 border border-blue-200'
                        }`}>
                          {u.role}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.status === 'aprobado'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {u.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              TAB: MANTENIMIENTO & SERVIDORES (EXISTENTE PRESERVADO)
             ======================================================== */}
          {activeAdminTab === 'mantenimiento' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-[#001428] flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#0284c7]" />
                  <span>Respaldo y Estado del Sistema</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Herramientas de respaldo seguro en archivo JSON y monitoreo del estado de conexión de Firebase y Google Workspace.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                  <div className="font-bold text-xs text-[#001428] flex items-center gap-2">
                    <Database className="w-4 h-4 text-[#0284c7]" />
                    <span>Copia de Seguridad Integral</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Descarga en un archivo único todos los datos de la intranet (visitas escolares, objetivos, cards de Instituto, cursos, novedades y configuración) o restaura una copia previa.
                  </p>
                  <button
                    type="button"
                    onClick={onOpenBackupModal}
                    className="w-full py-2 bg-[#001428] hover:bg-[#0e4a7b] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Database className="w-3.5 h-3.5 text-sky-400" />
                    <span>Abrir Panel de Respaldo y Restauración</span>
                  </button>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                  <div className="font-bold text-xs text-[#001428] flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[#0284c7]" />
                    <span>Conexión Firebase & Google Workspace</span>
                  </div>
                  <div className="text-xs text-slate-600 space-y-1.5 font-mono text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="font-sans text-slate-500">Proyecto Firebase:</span>
                      <span className="font-bold text-[#001428]">{firebaseInfo.config.projectId}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-sans text-slate-500">Auth Domain:</span>
                      <span className="text-slate-700 truncate max-w-[180px]">{firebaseInfo.config.authDomain}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-sans text-slate-500">Google Workspace:</span>
                      <span className={hasWorkspaceToken ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                        {hasWorkspaceToken ? 'Activo (OAuth)' : 'No conectado'}
                      </span>
                    </div>
                  </div>
                  <a
                    href={`https://console.firebase.google.com/project/${firebaseInfo.config.projectId}/authentication`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[#001428] text-xs font-semibold"
                  >
                    <span>Abrir Consola de Firebase</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal for Visit Cancellation */}
      {cancellingVisit && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-600" />
                <h3 className="text-sm sm:text-base font-extrabold text-[#001428]">
                  Cancelar Visita Escolar
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCancellingVisit(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmCancellation} className="space-y-4">
              <div className="p-3 bg-rose-50 rounded-lg text-xs text-rose-900 border border-rose-200">
                Estás cancelando la visita programada para <strong>{cancellingVisit.institution || cancellingVisit.title}</strong> el día <strong>{cancellingVisit.date}</strong>.
              </div>

              <div>
                <label className="block text-xs font-bold text-[#001428] mb-1">
                  Motivo de cancelación (se registrará en el sistema):
                </label>
                <textarea
                  required
                  rows={3}
                  value={cancellationReasonInput}
                  onChange={(e) => setCancellationReasonInput(e.target.value)}
                  placeholder="Ej: La institución informó paro de transporte / Inconveniente del contingente..."
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-1 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              {/* Pre-fill quick reason chips */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Motivos frecuentes:</span>
                <div className="flex flex-wrap gap-1">
                  {[
                    'Paro de transporte / Problemas de traslado',
                    'Inasistencia del contingente escolar',
                    'Superposición horaria de actividades',
                    'Reprogramación solicitada por directivos',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCancellationReasonInput(preset)}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[10px] text-slate-700 font-medium transition-colors cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setCancellingVisit(null)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  Confirmar Cancelación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de confirmación para eliminar card de área */}
      <ConfirmationModal
        isOpen={Boolean(cardToDelete)}
        title="Eliminar Card del Instituto"
        description={`¿Estás seguro de que deseas eliminar la card "${cardToDelete?.title || ''}"? Ya no se mostrará en el organigrama de la sección Instituto.`}
        confirmLabel="Eliminar Card"
        cancelLabel="Cancelar"
        isDestructive={true}
        itemDetails={cardToDelete ? [
          { label: 'Área', value: cardToDelete.title },
          { label: 'Rol / Función', value: cardToDelete.role },
          { label: 'Posición', value: `#${cardToDelete.order}` },
        ] : undefined}
        onConfirm={handleConfirmDeleteAreaCard}
        onCancel={() => setCardToDelete(null)}
      />

      {/* Modal de confirmación para restablecer orden y cards */}
      <ConfirmationModal
        isOpen={isResetAreasConfirmOpen}
        title="Restablecer Cards del Instituto"
        description="Se restaurarán las 6 áreas operativas institucionales predeterminadas y su orden original oficial. Los cambios personalizados que hayas realizado se reemplazarán por los valores de fábrica."
        confirmLabel="Restablecer Todo"
        cancelLabel="Cancelar"
        isDestructive={false}
        onConfirm={handleConfirmResetAreas}
        onCancel={() => setIsResetAreasConfirmOpen(false)}
      />

      {/* Modal de confirmación para restablecer datos institucionales */}
      <ConfirmationModal
        isOpen={isResetSettingsConfirmOpen}
        title="Restablecer Datos Institucionales"
        description="Se restablecerán todos los datos del Instituto (nombre, sede, correo, conmutador, horarios, copyright y las 3 tarjetas de pilares: Misión, Objetivos y Principios) a sus valores predeterminados oficiales."
        confirmLabel="Restaurar Predeterminado"
        cancelLabel="Cancelar"
        isDestructive={false}
        onConfirm={handleConfirmResetSettings}
        onCancel={() => setIsResetSettingsConfirmOpen(false)}
      />
    </div>
  );
}

// Subcomponent for Adding / Editing Area Cards
function AreaCardForm({
  initialData,
  totalAreas,
  onSave,
  onCancel,
}: {
  initialData: InstituteAreaCard | null;
  totalAreas: number;
  onSave: (data: InstituteAreaCard) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [role, setRole] = useState(initialData?.role || '');
  const [desc, setDesc] = useState(initialData?.desc || '');
  const [tag, setTag] = useState(initialData?.tag || 'GESTIÓN');
  const [iconName, setIconName] = useState<InstituteAreaIconName>(initialData?.iconName || 'Building2');
  const [order, setOrder] = useState<number>(initialData?.order || totalAreas + 1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      id: initialData?.id || `area-${Date.now()}`,
      title: title.trim(),
      role: role.trim(),
      desc: desc.trim(),
      tag: tag.trim() || 'ÁREA',
      iconName,
      order: Number(order) || 1,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-bold text-[#001428] mb-1">Título del Área *</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Área de Protocolo y Visitas"
            className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-[#001428] mb-1">Función / Rol *</label>
          <input
            type="text"
            required
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Ej: Gestión y Relaciones Institucionales"
            className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-[#001428] mb-1">Etiqueta / Tag *</label>
          <input
            type="text"
            required
            value={tag}
            onChange={(e) => setTag(e.target.value.toUpperCase())}
            placeholder="Ej: GESTIÓN, TECNOLOGÍA"
            className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none uppercase font-mono font-bold"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-bold text-[#001428] mb-1">Descripción de Funciones *</label>
          <textarea
            required
            rows={3}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Describe las tareas estratégicas y operativas del área..."
            className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
          />
        </div>

        {/* Position in grid */}
        <div>
          <label className="block text-xs font-bold text-[#001428] mb-1">Posición en la Sección Instituto</label>
          <select
            value={order}
            onChange={(e) => setOrder(Number(e.target.value))}
            className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white font-bold focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
          >
            {Array.from({ length: Math.max(totalAreas, order) }, (_, i) => i + 1).map((pos) => (
              <option key={pos} value={pos}>
                Posición {pos} {pos === 1 ? '(Primera)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Icon selector */}
        <div className="sm:col-span-2 space-y-1.5 pt-1 border-t border-slate-200">
          <label className="block text-xs font-bold text-[#001428]">Seleccionar Ícono Representativo:</label>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {AVAILABLE_ICONS.map((item) => {
              const IconComp = item.icon;
              const isSelected = iconName === item.name;
              return (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => setIconName(item.name)}
                  className={`p-2.5 sm:p-2 rounded-lg border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#001428] text-white border-[#001428] ring-2 ring-sky-400'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                  title={item.label}
                >
                  <IconComp className="w-4 h-4" />
                  <span className="text-[10px] sm:text-[9px] font-semibold truncate max-w-full">{item.label.split('/')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-slate-200">
        <button
          type="button"
          onClick={onCancel}
          className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-xs font-bold text-slate-700 transition-colors cursor-pointer text-center"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="w-full sm:w-auto px-5 py-2.5 sm:py-2 rounded-lg bg-[#001428] hover:bg-[#122a45] text-white text-xs font-bold transition-colors cursor-pointer shadow-xs text-center"
        >
          Guardar Cambios
        </button>
      </div>
    </form>
  );
}
