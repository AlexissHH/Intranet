'use client';

import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Clock,
  User,
  PlusCircle,
  FileCheck,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Sparkles,
  X,
  CheckSquare,
  Square,
  AlertTriangle,
  Award,
  Star,
  ExternalLink,
  ShieldCheck,
  Calendar,
  Edit2,
} from 'lucide-react';
import { TrainingCourse, CourseModuleCheck, AgentCourseAudit } from '@/lib/mock-data';
import { getCourseAudits, toggleCourseModuleCheck, submitAuditCsat, getCourseCsatStats } from '@/lib/storage';
import type { UserProfile } from '@/lib/auth';
import { useBottomSheetDrag } from '@/lib/useBottomSheetDrag';
import { BottomSheetHandle } from '@/components/BottomSheetHandle';

interface TrainingSectionProps {
  courses: TrainingCourse[];
  onSaveCourse: (course: TrainingCourse) => void;
  /** Solo se pasa cuando el asistente de IA está habilitado; sin él no se muestra el botón. */
  onOpenAiAssistantWithPrompt?: (prompt: string, mode: 'fast' | 'general' | 'thinking') => void;
  user?: UserProfile | null;
}

export function TrainingSection({
  courses,
  onSaveCourse,
  onOpenAiAssistantWithPrompt,
  user,
}: TrainingSectionProps) {
  const [filter, setFilter] = useState<string>('todos');
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [isNewCourseModalOpen, setIsNewCourseModalOpen] = useState(false);
  const [audits, setAudits] = useState<AgentCourseAudit[]>(() => getCourseAudits());
  const [selectedAuditForCert, setSelectedAuditForCert] = useState<AgentCourseAudit | null>(null);

  useEffect(() => {
    const handleStorageChange = () => {
      setAudits(getCourseAudits());
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const currentUserEmail = (user?.email || 'agente.intranet@legislatura.gob.ar').toLowerCase();
  const currentUserName = user?.displayName || 'Agente Legislativo';
  const isAdmin = user?.role === 'administrador';

  const handleToggleModule = (course: TrainingCourse, unitIndex: number) => {
    const { updatedAudit, allAudits } = toggleCourseModuleCheck(course, unitIndex, {
      displayName: currentUserName,
      email: currentUserEmail,
    });
    setAudits(allAudits);
  };

  const handleRateCsat = (auditId: string, rating: 'Muy Satisfecho' | 'Satisfecho' | 'Neutral' | 'Insatisfecho') => {
    const updated = submitAuditCsat(auditId, rating);
    setAudits(updated);
  };

  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Derecho y Gestión Parlamentaria');
  const [newModality, setNewModality] = useState<'Presencial' | 'Híbrida' | 'Virtual Sincrónica' | 'Virtual Asincrónica'>('Híbrida');
  const [newStatus, setNewStatus] = useState<'Inscripciones abiertas' | 'En curso' | 'Próximamente' | 'Completado'>('Inscripciones abiertas');
  const [newHours, setNewHours] = useState<number>(24);
  const [newInstructor, setNewInstructor] = useState('');
  const [newTarget, setNewTarget] = useState('Personal y asesores de comisiones');
  const [newSchedule, setNewSchedule] = useState('Martes de 14:00 a 17:00 hs');
  const [newDescription, setNewDescription] = useState('');
  const [newSyllabus, setNewSyllabus] = useState('Unidad 1: Marco normativo\nUnidad 2: Casos de estudio\nUnidad 3: Taller integrador');
  const [newDriveFolderUrl, setNewDriveFolderUrl] = useState('');
  const [newFormUrl, setNewFormUrl] = useState('');

  const handleCloseModal = () => {
    setIsNewCourseModalOpen(false);
    setEditingCourseId(null);
  };

  const newCourseSheet = useBottomSheetDrag({
    isOpen: isNewCourseModalOpen,
    onClose: handleCloseModal,
  });

  const handleOpenCreateModal = () => {
    if (!isAdmin) return;
    setEditingCourseId(null);
    setNewTitle('');
    setNewCategory('Derecho y Gestión Parlamentaria');
    setNewModality('Híbrida');
    setNewStatus('Inscripciones abiertas');
    setNewHours(24);
    setNewInstructor('');
    setNewTarget('Personal y asesores de comisiones');
    setNewSchedule('Martes de 14:00 a 17:00 hs');
    setNewDescription('');
    setNewSyllabus('Unidad 1: Marco normativo\nUnidad 2: Casos de estudio\nUnidad 3: Taller integrador');
    setNewDriveFolderUrl('');
    setNewFormUrl('');
    setIsNewCourseModalOpen(true);
  };

  const handleOpenEditModal = (course: TrainingCourse) => {
    setEditingCourseId(course.id);
    setNewTitle(course.title);
    setNewCategory(course.category);
    setNewModality(course.modality);
    setNewStatus(course.status);
    setNewHours(course.durationHours);
    setNewInstructor(course.instructor);
    setNewTarget(course.targetAudience || 'Personal y asesores de comisiones');
    setNewSchedule(course.schedule || 'Martes de 14:00 a 17:00 hs');
    setNewDescription(course.description);
    setNewSyllabus(Array.isArray(course.syllabus) ? course.syllabus.join('\n') : '');
    setNewDriveFolderUrl(course.driveFolderUrl || '');
    setNewFormUrl(course.formUrl || '');
    setIsNewCourseModalOpen(true);
  };

  React.useEffect(() => {
    if (!isNewCourseModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isNewCourseModalOpen]);

  const filteredCourses = courses.filter((c) => {
    if (filter === 'todos') return true;
    if (filter === 'abiertas') return c.status === 'Inscripciones abiertas';
    if (filter === 'en_curso') return c.status === 'En curso';
    return true;
  });

  const handleSubmitCourse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const courseObj: TrainingCourse = {
      id: editingCourseId || ('course-' + Date.now()),
      title: newTitle.trim(),
      category: newCategory,
      modality: newModality,
      durationHours: Number(newHours) || 20,
      targetAudience: newTarget.trim() || 'Personal y asesores de comisiones',
      status: newStatus,
      instructor: newInstructor.trim() || 'Equipo Docente del Instituto',
      description: newDescription.trim() || 'Trayecto formativo oficial del Instituto de Capacitación Legislativa.',
      schedule: newSchedule.trim() || 'A definir',
      syllabus: newSyllabus
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0),
      driveFolderUrl: newDriveFolderUrl.trim() || undefined,
      formUrl: newFormUrl.trim() || undefined,
    };

    onSaveCourse(courseObj);
    handleCloseModal();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Inscripciones abiertas':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'En curso':
        return 'bg-blue-50 text-[#0284c7] border-blue-200';
      case 'Próximamente':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 p-6 sm:p-7 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#eff6ff] text-[#0284c7] text-[11px] font-bold border border-[#bfdbfe]">
            <GraduationCap className="w-3 h-3 text-[#0284c7]" />
            <span className="uppercase tracking-wider">DIRECCIÓN ACADÉMICA • CICLO LECTIVO 2026</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#001428] tracking-tight">
            Cursos, Talleres y Trayectos Formativos
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Oferta formativa permanente para personal de la Cámara, asesores de comisiones y bloques políticos. Actualizada y gestionada directamente por el equipo docente.
          </p>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#001428] hover:bg-[#122a45] text-white text-xs font-semibold rounded shadow-xs transition-colors cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Nuevo Curso</span>
            </button>
            {onOpenAiAssistantWithPrompt && (
            <button
              onClick={() =>
                onOpenAiAssistantWithPrompt(
                  'Diseñar un programa académico de 4 semanas para capacitar a secretarios letrados en control de constitucionalidad y técnica legislativa comparada.',
                  'thinking'
                )
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-[#001428] border border-slate-200 text-xs font-semibold rounded transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#0284c7]" />
              <span>Diseñar con IA</span>
            </button>
            )}
          </div>
        )}
      </div>

      {/* Indicador Oficial de Calidad Académica e Índice CSAT */}
      {(() => {
        const csatStats = getCourseCsatStats();
        return (
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 sm:p-5 shadow-2xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-start sm:items-center gap-2.5 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0 mt-0.5 sm:mt-0">
                  <Star className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 fill-emerald-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <h3 className="text-xs sm:text-sm font-bold text-[#001428] leading-tight">
                      Satisfacción Académica (Índice CSAT)
                    </h3>
                    <span className="px-1.5 py-0.2 rounded text-[9px] sm:text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider shrink-0">
                      Homologado
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-snug sm:leading-relaxed">
                    Medición directa de satisfacción de los agentes legislativos al completar los trayectos formativos de la Cámara.
                  </p>
                </div>
              </div>

              {/* Métricas con diseño equilibrado y adaptable a pantallas de celular */}
              <div className="grid grid-cols-3 gap-1.5 p-2 bg-slate-50/70 rounded-lg border border-slate-100 text-center sm:text-left sm:bg-transparent sm:border-0 sm:p-0 sm:flex sm:items-center sm:gap-6 md:border-l md:border-slate-100 md:pl-6 shrink-0">
                <div className="px-0.5 sm:px-0">
                  <div className="text-lg sm:text-2xl font-black text-emerald-700 leading-tight">
                    {csatStats.hasData ? `${csatStats.csatPercentage}%` : '—'}
                  </div>
                  <div className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">
                    Índice CSAT
                  </div>
                </div>

                <div className="w-px h-7 bg-slate-200 hidden sm:block"></div>

                <div className="px-0.5 sm:px-0 border-x border-slate-200/60 sm:border-0">
                  <div className="text-lg sm:text-2xl font-black text-[#001428] leading-tight flex items-center justify-center sm:justify-start gap-0.5">
                    <span>{csatStats.hasData ? csatStats.averageRating5 : '—'}</span>
                    <span className="text-[10px] sm:text-xs text-slate-400 font-normal">/ 5.0</span>
                  </div>
                  <div className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">
                    Promedio
                  </div>
                </div>

                <div className="w-px h-7 bg-slate-200 hidden sm:block"></div>

                <div className="px-0.5 sm:px-0">
                  <div className="text-lg sm:text-2xl font-black text-[#0284c7] leading-tight">
                    {csatStats.totalEvaluations}
                  </div>
                  <div className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">
                    Encuestas
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="flex items-center justify-between gap-4 flex-wrap pb-1 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter('todos')}
            className={`px-3 py-1.5 text-xs font-bold rounded transition-colors cursor-pointer ${
              filter === 'todos'
                ? 'bg-[#001428] text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Todos ({courses.length})
          </button>
          <button
            onClick={() => setFilter('abiertas')}
            className={`px-3 py-1.5 text-xs font-bold rounded transition-colors cursor-pointer ${
              filter === 'abiertas'
                ? 'bg-emerald-700 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Inscripciones Abiertas
          </button>
          <button
            onClick={() => setFilter('en_curso')}
            className={`px-3 py-1.5 text-xs font-bold rounded transition-colors cursor-pointer ${
              filter === 'en_curso'
                ? 'bg-[#0284c7] text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            En Curso
          </button>
        </div>
        <span className="text-xs text-slate-400 font-medium">
          {filteredCourses.length} programas disponibles
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredCourses.map((course) => {
          const isExpanded = expandedCourseId === course.id;
          return (
            <div
              key={course.id}
              className="bg-white rounded-lg border border-slate-200 hover:border-slate-300 p-4 sm:p-5 shadow-xs flex flex-col justify-between transition-colors min-w-0"
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#0284c7] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {course.category}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${getStatusBadge(
                      course.status
                    )}`}
                  >
                    {course.status}
                  </span>
                </div>

                <h3 className="text-sm sm:text-base font-bold text-[#001428] leading-snug">
                  {course.title}
                </h3>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {course.description}
                </p>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-1">
                  <div className="flex items-center gap-1.5 bg-slate-50 p-2 rounded border border-slate-100">
                    <Clock className="w-3.5 h-3.5 text-[#0284c7]" />
                    <span><strong>Carga:</strong> {course.durationHours} hs</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-slate-50 p-2 rounded border border-slate-100">
                    <GraduationCap className="w-3.5 h-3.5 text-[#0284c7]" />
                    <span><strong>Modalidad:</strong> {course.modality}</span>
                  </div>
                  <div className="col-span-2 flex items-center gap-1.5 bg-slate-50 p-2 rounded border border-slate-100">
                    <User className="w-3.5 h-3.5 text-[#0284c7]" />
                    <span><strong>Docente:</strong> {course.instructor}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-3 animate-in fade-in">
                    {/* Coursera-style checklist and progress tracking */}
                    {(() => {
                      const agentAudit = audits.find(
                        (a) => a.courseId === course.id && a.agentEmail.toLowerCase() === currentUserEmail
                      );
                      const completedChecks = agentAudit?.checks || [];
                      const totalUnits = course.syllabus?.length || 1;
                      const progressPct = Math.round((completedChecks.length / totalUnits) * 100);

                      return (
                        <div className="space-y-2.5 pt-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-[#001428] flex items-center gap-1.5">
                              <span>Módulos de Lectura</span>
                              <span className="text-[10px] font-normal text-slate-500">
                                • Tilda cada módulo al finalizar en Drive
                              </span>
                            </span>
                            <span className="text-[11px] font-extrabold text-[#0284c7]">
                              {completedChecks.length} de {totalUnits} ({progressPct}%)
                            </span>
                          </div>

                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                            <div
                              className="bg-gradient-to-r from-sky-500 to-emerald-500 h-full rounded-full transition-all duration-300"
                              style={{ width: `${progressPct}%` }}
                            ></div>
                          </div>

                          <ul className="space-y-1.5 pt-1">
                            {(course.syllabus || []).map((unit, idx) => {
                              const isChecked = completedChecks.some((c) => c.unitIndex === idx);
                              const checkRecord = completedChecks.find((c) => c.unitIndex === idx);
                              return (
                                <li
                                  key={idx}
                                  onClick={() => handleToggleModule(course, idx)}
                                  className={`p-2.5 rounded-lg border flex items-start gap-2.5 transition-all cursor-pointer select-none ${
                                    isChecked
                                      ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                                      : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                                  }`}
                                  title={isChecked ? 'Clic para desmarcar' : 'Clic para marcar como leído'}
                                >
                                  <div className="mt-0.5 shrink-0">
                                    {isChecked ? (
                                      <CheckSquare className="w-4 h-4 text-emerald-600" />
                                    ) : (
                                      <Square className="w-4 h-4 text-slate-400" />
                                    )}
                                  </div>
                                  <div className="flex-1 text-xs">
                                    <div
                                      className={`font-semibold ${
                                        isChecked ? 'text-emerald-900' : 'text-[#001428]'
                                      }`}
                                    >
                                      {unit}
                                    </div>
                                    {isChecked && checkRecord && (
                                      <div className="text-[10px] text-emerald-700 font-medium mt-0.5 flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-emerald-600" />
                                        <span>Leído y registrado: {checkRecord.completedAt}</span>
                                      </div>
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>

                          {/* CSAT Survey Prompt when fully completed */}
                          {completedChecks.length >= totalUnits && agentAudit && (
                            <div className="mt-2 space-y-2 animate-in fade-in">
                              {!agentAudit.csatRating ? (
                                <div className="p-3 bg-sky-50/70 border border-sky-200 rounded-lg space-y-2">
                                  <div className="flex items-center gap-2 text-xs font-bold text-[#001428]">
                                    <Star className="w-4 h-4 text-amber-500 fill-amber-500 shrink-0" />
                                    <span>
                                      ¡Completaste el temario! Califica la capacitación (Índice CSAT):
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {(['Muy Satisfecho', 'Satisfecho', 'Neutral', 'Insatisfecho'] as const).map(
                                      (rating) => (
                                        <button
                                          key={rating}
                                          type="button"
                                          onClick={() => handleRateCsat(agentAudit.id, rating)}
                                          className="px-2.5 py-1.5 rounded-md bg-white border border-blue-200 hover:border-blue-400 hover:bg-blue-50 text-[11px] font-bold text-[#001428] transition-all cursor-pointer shadow-2xs text-center"
                                        >
                                          {rating}
                                        </button>
                                      )
                                    )}
                                  </div>
                                  <p className="text-[10px] text-slate-500">
                                    Tu calificación alimenta directamente el índice de satisfacción general en la Intranet.
                                  </p>
                                </div>
                              ) : (
                                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between gap-2 text-xs text-emerald-900">
                                  <div className="flex items-center gap-2 font-bold">
                                    <Award className="w-4 h-4 text-emerald-600 shrink-0" />
                                    <span>CSAT registrado: {agentAudit.csatRating}. ¡Curso listo para acreditar!</span>
                                  </div>
                                </div>
                              )}

                              {/* Alert notice if all checks were done simultaneously */}
                              {agentAudit.auditStatus === 'alerta_simultanea' && (
                                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-[11px] text-amber-900">
                                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                  <div>
                                    <strong>Auditoría de Tiempo de Lectura:</strong> Se registraron los {totalUnits} módulos en un intervalo de {agentAudit.timeDeltaMinutes < 1 ? 'menos de 1 minuto' : `${agentAudit.timeDeltaMinutes} minutos`}. La Dirección Académica verifica las marcas de tiempo para cursos de {course.durationHours} hs antes de homologar la certificación definitiva.
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <div className="pt-1 text-[11px] text-slate-500 border-t border-slate-100">
                      <strong>Horario y cursada:</strong> {course.schedule}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setExpandedCourseId(isExpanded ? null : course.id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-[#001428] cursor-pointer self-start sm:self-auto py-0.5"
                >
                  <span>{isExpanded ? 'Ocultar temario' : 'Ver temario completo'}</span>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(course)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded border border-slate-200 transition-colors cursor-pointer shrink-0"
                      title="Editar curso y enlace de Google Drive"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                      <span>Editar</span>
                    </button>
                  )}

                  <a
                    href={course.formUrl || 'https://docs.google.com/forms'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-[#0284c7] text-xs font-semibold rounded border border-blue-200 transition-colors cursor-pointer shrink-0"
                    title={course.formUrl ? 'Abrir formulario oficial de inscripción' : 'Formulario de inscripción'}
                  >
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>Inscripción</span>
                  </a>

                  <a
                    href={course.driveFolderUrl || 'https://drive.google.com'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded border transition-colors cursor-pointer shrink-0 ${
                      course.driveFolderUrl
                        ? 'bg-sky-50 hover:bg-sky-100 text-[#0284c7] border-sky-200 font-bold'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    }`}
                    title={
                      course.driveFolderUrl
                        ? 'Abrir carpeta oficial de materiales en Google Drive'
                        : 'Abrir Google Drive'
                    }
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-[#0284c7]" />
                    <span>Materiales</span>
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isNewCourseModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsNewCourseModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden sm:overflow-y-auto overscroll-none"
        >
          <div
            data-bottom-sheet="true"
            style={newCourseSheet.sheetStyle}
            className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain h-[88dvh] sm:h-auto sm:max-h-[90vh] flex flex-col animate-in fade-in sm:zoom-in-95 duration-200"
          >
            <BottomSheetHandle
              {...newCourseSheet.dragBind}
              isExpanded={newCourseSheet.isExpanded}
              isDragging={newCourseSheet.isDragging}
            />
            <div
              {...newCourseSheet.dragBind}
              className="p-4 sm:p-6 pb-3 sm:pb-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 select-none touch-none sm:touch-auto cursor-grab active:cursor-grabbing sm:cursor-default"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <GraduationCap className="w-5 h-5 text-[#001428] shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-[#001428] tracking-tight truncate">
                    {editingCourseId ? 'Editar Curso / Trayecto Formativo' : 'Nuevo Curso o Programa Formativo'}
                  </h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                    {editingCourseId
                      ? 'Actualización de temario, horarios y carpetas de Google Drive'
                      : 'Gestión de trayectos académicos y diplomaturas'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="hidden sm:flex text-slate-400 hover:text-slate-800 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ml-2"
                title="Cerrar ventana"
                aria-label="Cerrar ventana"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitCourse} className="p-4 sm:p-6 space-y-3.5 overflow-y-auto flex-1 text-xs text-slate-800">
              <div>
                <label className="block text-xs font-bold text-[#001428] mb-1">Nombre del Curso / Trayecto *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ej. Diplomatura en Gestión y Redacción Parlamentaria"
                  className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#001428] mb-1">Categoría</label>
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#001428] mb-1">Modalidad</label>
                  <select
                    value={newModality}
                    onChange={(e: any) => setNewModality(e.target.value)}
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none bg-white"
                  >
                    <option value="Presencial">Presencial</option>
                    <option value="Híbrida">Híbrida</option>
                    <option value="Virtual Sincrónica">Virtual Sincrónica</option>
                    <option value="Virtual Asincrónica">Virtual Asincrónica</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#001428] mb-1">Estado</label>
                  <select
                    value={newStatus}
                    onChange={(e: any) => setNewStatus(e.target.value)}
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none bg-white"
                  >
                    <option value="Inscripciones abiertas">Inscripciones abiertas</option>
                    <option value="En curso">En curso</option>
                    <option value="Próximamente">Próximamente</option>
                    <option value="Completado">Completado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#001428] mb-1">Carga Horaria (Horas)</label>
                  <input
                    type="number"
                    min={1}
                    value={newHours}
                    onChange={(e) => setNewHours(Number(e.target.value))}
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#001428] mb-1">Docente / Expositor</label>
                  <input
                    type="text"
                    value={newInstructor}
                    onChange={(e) => setNewInstructor(e.target.value)}
                    placeholder="Lic. o Dr."
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#001428] mb-1">Horario y Días de Cursada</label>
                <input
                  type="text"
                  value={newSchedule}
                  onChange={(e) => setNewSchedule(e.target.value)}
                  placeholder="Ej. Martes y Jueves de 14:00 a 16:30 hs"
                  className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                />
              </div>

              {/* GOOGLE DRIVE LINK FIELD */}
              <div className="bg-sky-50/70 p-3.5 rounded-lg border border-sky-200/90 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-[#001428] flex items-center gap-1.5">
                    <FolderOpen className="w-4 h-4 text-[#0284c7]" />
                    <span>Enlace de Google Drive del Contenido / Materiales (Dossier)</span>
                  </label>
                  {newDriveFolderUrl && (
                    <a
                      href={newDriveFolderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0284c7] hover:underline"
                    >
                      <span>Probar enlace</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="url"
                    value={newDriveFolderUrl}
                    onChange={(e) => setNewDriveFolderUrl(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/... o enlace compartido de Drive"
                    className="w-full text-xs p-2.5 pl-8.5 rounded-md border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none text-slate-800"
                  />
                  <FolderOpen className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <p className="text-[10px] text-slate-600 leading-relaxed">
                  Pega aquí la URL de la carpeta o archivos de Drive. El botón <strong>«Materiales»</strong> de la tarjeta abrirá directamente este enlace para que el equipo consulte los PDFs, presentaciones y documentos oficiales.
                </p>
              </div>

              {/* GOOGLE FORMS LINK FIELD */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-[#001428] flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5 text-[#0284c7]" />
                    <span>Enlace del Formulario de Inscripción (Google Forms - Opcional)</span>
                  </label>
                  {newFormUrl && (
                    <a
                      href={newFormUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0284c7] hover:underline"
                    >
                      <span>Probar formulario</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="url"
                    value={newFormUrl}
                    onChange={(e) => setNewFormUrl(e.target.value)}
                    placeholder="https://docs.google.com/forms/d/... (opcional)"
                    className="w-full text-xs p-2.5 pl-8.5 rounded-md border border-slate-300 bg-white focus:ring-1 focus:ring-[#0284c7] focus:outline-none text-slate-800"
                  />
                  <FileCheck className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#001428] mb-1">Descripción Breve</label>
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#001428] mb-1">Temario (un módulo por línea)</label>
                <textarea
                  rows={3}
                  value={newSyllabus}
                  onChange={(e) => setNewSyllabus(e.target.value)}
                  className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none font-mono"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-col-reverse sm:flex-row items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="w-full sm:w-auto text-center px-4 py-2.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold transition-colors cursor-pointer border border-slate-200 sm:border-transparent"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto text-center px-4 py-2.5 bg-[#001428] hover:bg-[#0e4a7b] text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  {editingCourseId ? 'Guardar Cambios' : 'Guardar Curso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
