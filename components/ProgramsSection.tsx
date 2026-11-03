'use client';

import React, { useState } from 'react';
import {
  Building2,
  ShieldCheck,
  GraduationCap,
  Scale,
  Cpu,
  PlusCircle,
  Mail,
  CheckCircle2,
  Landmark,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { ProjectProgram } from '@/lib/mock-data';
import { useBottomSheetDrag } from '@/lib/useBottomSheetDrag';
import { BottomSheetHandle } from '@/components/BottomSheetHandle';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { assertSafeEmailAddress } from '@/lib/workspace';

interface ProgramsSectionProps {
  programs: ProjectProgram[];
  onSaveProgram: (program: ProjectProgram) => void;
  onDeleteProgram: (id: string) => void;
  onOpenEmailTo: (email: string, subject: string) => void;
  isAdmin?: boolean;
}

/** Renglones no vacíos de un texto (uno por línea). */
function linesOf(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** «Etiqueta: valor» por renglón. Los renglones sin etiqueta o sin valor se ignoran: nada se completa por defecto. */
function parseStats(text: string): { label: string; value: string }[] {
  return linesOf(text).flatMap((line) => {
    const idx = line.indexOf(':');
    if (idx <= 0) return [];
    const label = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    return label && value ? [{ label, value }] : [];
  });
}

export function ProgramsSection({
  programs,
  onSaveProgram,
  onDeleteProgram,
  onOpenEmailTo,
  isAdmin = false,
}: ProgramsSectionProps) {
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(programs[0]?.id || null);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);

  const newProjectSheet = useBottomSheetDrag({
    isOpen: isNewProjectModalOpen,
    onClose: () => setIsNewProjectModalOpen(false),
  });

  const selectedProgram = programs.find((p) => p.id === selectedProgramId) || programs[0] || null;

  // Ningún campo trae valores por defecto: solo se guarda lo que el administrador escribe.
  const [editingProgram, setEditingProgram] = useState<ProjectProgram | null>(null);
  const [programToDelete, setProgramToDelete] = useState<ProjectProgram | null>(null);
  const [progTitle, setProgTitle] = useState('');
  const [progBadge, setProgBadge] = useState('');
  const [progAudience, setProgAudience] = useState('');
  const [progSummary, setProgSummary] = useState('');
  const [progDescription, setProgDescription] = useState('');
  const [progObjectives, setProgObjectives] = useState('');
  const [progActivities, setProgActivities] = useState('');
  const [progStats, setProgStats] = useState('');
  const [progEmail, setProgEmail] = useState('');
  const [progEmailError, setProgEmailError] = useState('');

  React.useEffect(() => {
    if (!isNewProjectModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsNewProjectModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isNewProjectModalOpen]);

  const getProgramIcon = (iconName: string) => {
    switch (iconName) {
      case 'Building2':
        return Building2;
      case 'ShieldCheck':
        return ShieldCheck;
      case 'GraduationCap':
        return GraduationCap;
      case 'Scale':
        return Scale;
      case 'Cpu':
        return Cpu;
      default:
        return Landmark;
    }
  };

  const handleOpenCreate = () => {
    setEditingProgram(null);
    setProgTitle('');
    setProgBadge('');
    setProgAudience('');
    setProgSummary('');
    setProgDescription('');
    setProgObjectives('');
    setProgActivities('');
    setProgStats('');
    setProgEmail('');
    setProgEmailError('');
    setIsNewProjectModalOpen(true);
  };

  const handleOpenEdit = (prog: ProjectProgram) => {
    setEditingProgram(prog);
    setProgTitle(prog.title);
    setProgBadge(prog.badge || '');
    setProgAudience(prog.targetAudience || '');
    setProgSummary(prog.summary || '');
    setProgDescription(prog.description || '');
    setProgObjectives((prog.objectives || []).join('\n'));
    setProgActivities((prog.activities || []).join('\n'));
    setProgStats((prog.stats || []).map((st) => `${st.label}: ${st.value}`).join('\n'));
    setProgEmail(prog.contactEmail || '');
    setProgEmailError('');
    setIsNewProjectModalOpen(true);
  };

  const handleSubmitProgram = (e: React.FormEvent) => {
    e.preventDefault();
    const title = progTitle.trim();
    if (!isAdmin || !title) return;

    // El correo es opcional; si se escribe, se valida (sin saltos de línea ni formato roto).
    const email = progEmail.trim();
    if (email) {
      try {
        assertSafeEmailAddress(email, 'Correo de coordinación');
      } catch (err) {
        setProgEmailError(err instanceof Error ? err.message : 'El correo de coordinación no es válido.');
        return;
      }
    }

    const saved: ProjectProgram = {
      id: editingProgram ? editingProgram.id : 'prog-' + Date.now(),
      title,
      // El código se conserva al editar; en un alta nueva son las iniciales del título.
      code:
        editingProgram?.code ||
        title
          .split(' ')
          .filter(Boolean)
          .map((w) => w[0])
          .join('')
          .substring(0, 4)
          .toUpperCase(),
      badge: progBadge.trim(),
      targetAudience: progAudience.trim(),
      summary: progSummary.trim(),
      description: progDescription.trim(),
      objectives: linesOf(progObjectives),
      activities: linesOf(progActivities),
      stats: parseStats(progStats),
      contactEmail: email,
      iconName: editingProgram?.iconName || 'Landmark',
    };

    onSaveProgram(saved);
    setSelectedProgramId(saved.id);
    setIsNewProjectModalOpen(false);
    setEditingProgram(null);
  };

  const confirmDeleteProgram = () => {
    if (!programToDelete) return;
    onDeleteProgram(programToDelete.id);
    if (selectedProgramId === programToDelete.id) setSelectedProgramId(null);
    setProgramToDelete(null);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 p-6 sm:p-7 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#eff6ff] text-[#0284c7] text-[11px] font-bold border border-[#bfdbfe]">
            <Landmark className="w-3 h-3 text-[#0284c7]" />
            <span className="uppercase tracking-wider">EJES ESTRATÉGICOS • EXTENSIÓN CIUDADANA</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#001428] tracking-tight">
            Programas y Proyectos Especiales
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Iniciativas transversales del Instituto dirigidas a la ciudadanía, la comunidad educativa y los equipos técnicos de la Cámara.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#001428] hover:bg-[#122a45] text-white text-xs font-semibold rounded shadow-xs transition-colors cursor-pointer shrink-0"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Sumar Nuevo Proyecto</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {programs.map((prog) => {
          const Icon = getProgramIcon(prog.iconName);
          const isSelected = selectedProgram?.id === prog.id;

          return (
            <button
              key={prog.id}
              onClick={() => setSelectedProgramId(prog.id)}
              className={`p-3.5 rounded-lg border text-left flex flex-col justify-between transition-colors cursor-pointer ${
                isSelected
                  ? 'border-[#0284c7] bg-blue-50/60 shadow-2xs'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className={`w-8 h-8 rounded flex items-center justify-center ${
                    isSelected ? 'bg-[#001428] text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  {prog.code}
                </span>
              </div>
              <div>
                <p className="text-xs font-bold text-[#001428] leading-tight line-clamp-2">
                  {prog.title}
                </p>
                {prog.badge && (
                  <p className="text-[10px] text-[#0284c7] font-semibold mt-1 truncate">
                    {prog.badge}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selectedProgram && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-5 sm:p-6 bg-[#001428] text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-3xl">
              <div className="flex items-center gap-2">
                {selectedProgram.badge && (
                  <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-300 text-[10px] font-bold uppercase tracking-wider border border-sky-800">
                    {selectedProgram.badge}
                  </span>
                )}
                <span className="text-xs text-slate-400">Código: {selectedProgram.code}</span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                {selectedProgram.title}
              </h3>
              {selectedProgram.summary && (
                <p className="text-xs text-slate-300 leading-relaxed">
                  {selectedProgram.summary}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {selectedProgram.contactEmail && (
                <button
                  onClick={() =>
                    onOpenEmailTo(
                      selectedProgram.contactEmail,
                      `Consulta sobre programa: ${selectedProgram.title}`
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0284c7] hover:bg-[#0369a1] text-white rounded text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Contactar Coordinación</span>
                </button>
              )}
              {isAdmin && (
                <>
                  <button
                    onClick={() => handleOpenEdit(selectedProgram)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-semibold transition-colors cursor-pointer border border-white/20"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </button>
                  <button
                    onClick={() => setProgramToDelete(selectedProgram)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              {selectedProgram.description && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#0284c7] mb-1.5">
                    DESCRIPCIÓN GENERAL
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {selectedProgram.description}
                  </p>
                </div>
              )}

              {selectedProgram.objectives.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#0284c7] mb-2">
                    OBJETIVOS ESPECÍFICOS
                  </div>
                  <div className="space-y-2">
                    {selectedProgram.objectives.map((obj, i) => (
                      <div key={i} className="flex items-start gap-2 p-2.5 rounded bg-slate-50 border border-slate-200 text-xs text-slate-800">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{obj}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedProgram.activities.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#0284c7] mb-2">
                    ACTIVIDADES CLAVE
                  </div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
                    {selectedProgram.activities.map((act, i) => (
                      <li key={i} className="p-2.5 rounded border border-slate-200 bg-white">
                        • {act}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {(selectedProgram.targetAudience || selectedProgram.contactEmail || (selectedProgram.stats?.length ?? 0) > 0) && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#001428]">
                    Ficha Técnica del Proyecto
                  </div>

                  <div className="space-y-2 text-xs">
                    {selectedProgram.targetAudience && (
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Población Destinataria</span>
                        <span className="font-semibold text-slate-800">{selectedProgram.targetAudience}</span>
                      </div>
                    )}
                    {selectedProgram.contactEmail && (
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Coordinación Operativa</span>
                        <span className="font-semibold text-slate-800">{selectedProgram.contactEmail}</span>
                      </div>
                    )}
                  </div>

                  {(selectedProgram.stats?.length ?? 0) > 0 && (
                    <div className="pt-3 border-t border-slate-200 grid grid-cols-2 gap-2 text-center">
                      {selectedProgram.stats.map((st, idx) => (
                        <div key={idx} className="p-2 bg-white rounded border border-slate-200">
                          <div className="text-xs font-black text-[#001428]">{st.value}</div>
                          <div className="text-[10px] text-slate-500">{st.label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isNewProjectModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsNewProjectModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden sm:overflow-y-auto overscroll-none"
        >
          <div
            data-bottom-sheet="true"
            style={newProjectSheet.sheetStyle}
            className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain h-[88dvh] sm:h-auto sm:max-h-[90vh] flex flex-col animate-in fade-in sm:zoom-in-95 duration-200"
          >
            <BottomSheetHandle
              {...newProjectSheet.dragBind}
              isExpanded={newProjectSheet.isExpanded}
              isDragging={newProjectSheet.isDragging}
            />
            <div
              {...newProjectSheet.dragBind}
              className="p-4 sm:p-6 pb-3 sm:pb-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 select-none touch-none sm:touch-auto cursor-grab active:cursor-grabbing sm:cursor-default"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Landmark className="w-5 h-5 text-[#001428] shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-[#001428] tracking-tight truncate">
                    {editingProgram ? 'Editar Proyecto Institucional' : 'Sumar Proyecto Institucional'}
                  </h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">Programas de formación, ciudadanía y extensión</p>
                </div>
              </div>
              <button
                onClick={() => setIsNewProjectModalOpen(false)}
                className="hidden sm:flex text-slate-400 hover:text-slate-800 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ml-2"
                title="Cerrar ventana"
                aria-label="Cerrar ventana"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitProgram} className="p-4 sm:p-6 space-y-3.5 overflow-y-auto flex-1 text-xs text-slate-800">
              <div>
                <label className="block text-xs font-bold text-[#001428] mb-1">Nombre del Proyecto *</label>
                <input
                  type="text"
                  required
                  value={progTitle}
                  onChange={(e) => setProgTitle(e.target.value)}
                  placeholder="Ej. Parlamento Juvenil por la Transparencia"
                  className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#001428] mb-1">Etiqueta / Área</label>
                  <input
                    type="text"
                    value={progBadge}
                    onChange={(e) => setProgBadge(e.target.value)}
                    placeholder="Opcional"
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#001428] mb-1">Destinatarios</label>
                  <input
                    type="text"
                    value={progAudience}
                    onChange={(e) => setProgAudience(e.target.value)}
                    placeholder="Opcional"
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#001428] mb-1">Resumen Ejecutivo</label>
                <textarea
                  rows={2}
                  value={progSummary}
                  onChange={(e) => setProgSummary(e.target.value)}
                  placeholder="Opcional"
                  className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#001428] mb-1">Descripción General</label>
                <textarea
                  rows={3}
                  value={progDescription}
                  onChange={(e) => setProgDescription(e.target.value)}
                  placeholder="Opcional"
                  className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#001428] mb-1">Objetivos (uno por renglón)</label>
                <textarea
                  rows={3}
                  value={progObjectives}
                  onChange={(e) => setProgObjectives(e.target.value)}
                  placeholder="Opcional"
                  className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#001428] mb-1">Actividades clave (una por renglón)</label>
                <textarea
                  rows={3}
                  value={progActivities}
                  onChange={(e) => setProgActivities(e.target.value)}
                  placeholder="Opcional"
                  className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#001428] mb-1">Datos destacados (uno por renglón)</label>
                <textarea
                  rows={2}
                  value={progStats}
                  onChange={(e) => setProgStats(e.target.value)}
                  placeholder="Opcional. Formato «Etiqueta: valor»"
                  className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">Los renglones sin «:» o sin valor se ignoran.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#001428] mb-1">Correo de coordinación</label>
                <input
                  type="email"
                  value={progEmail}
                  onChange={(e) => {
                    setProgEmail(e.target.value);
                    setProgEmailError('');
                  }}
                  placeholder="Opcional"
                  className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                />
                {progEmailError && <p className="text-[10px] text-rose-600 mt-1">{progEmailError}</p>}
                <p className="text-[10px] text-slate-400 mt-1">Si lo dejas vacío, el proyecto no muestra el botón «Contactar Coordinación».</p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-col-reverse sm:flex-row items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsNewProjectModalOpen(false)}
                  className="w-full sm:w-auto text-center px-4 py-2.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold transition-colors cursor-pointer border border-slate-200 sm:border-transparent"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto text-center px-4 py-2.5 bg-[#001428] hover:bg-[#0e4a7b] text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  {editingProgram ? 'Guardar Cambios' : 'Guardar Proyecto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={Boolean(programToDelete)}
        title="Eliminar programa o proyecto"
        description={`¿Seguro que quieres eliminar "${programToDelete?.title}"? Se quita para todos los usuarios y no se puede deshacer.`}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        isDestructive={true}
        onConfirm={confirmDeleteProgram}
        onCancel={() => setProgramToDelete(null)}
      />
    </div>
  );
}
