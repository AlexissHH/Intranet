'use client';

import React, { useEffect, useState } from 'react';
import { getInstitutionalSettings, DEFAULT_SETTINGS } from '@/lib/storage';
import {
  Lock,
  Shield,
  LogIn,
  Building2,
  Calendar,
  Users,
  FolderOpen,
  GraduationCap,
  Landmark,
  Link2,
  ArrowRight,
  KeyRound,
} from 'lucide-react';

interface RestrictedAccessViewProps {
  mode: 'home' | 'module';
  moduleId?: string;
  onOpenLoginModal: () => void;
  onNavigateTab: (tab: string) => void;
  /** true si ya hay una sesión iniciada (pero sin permisos suficientes para este módulo). */
  isLoggedIn?: boolean;
}

const PROTECTED_MODULES: Record<
  string,
  {
    title: string;
    subtitle: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    securityNote: string;
  }
> = {
  capacitacion: {
    title: 'Capacitación y Formación Parlamentaria',
    subtitle: 'Cursos internos, diplomaturas, aulas virtuales y legajos académicos',
    description:
      'Este módulo contiene el cronograma de cursada interna, enlaces a aulas virtuales, inscripciones de agentes legislativos y material bibliográfico reservado.',
    icon: GraduationCap,
    securityNote: 'Acceso exclusivo para personal legislativo y agentes acreditados.',
  },
  programas: {
    title: 'Programas y Proyectos Institucionales',
    subtitle: 'Coordinación operativa, estadísticas internas y responsables de área',
    description:
      'Información operativa de programas de extensión parlamentaria, métricas de ejecución y canales de comunicación interna.',
    icon: Landmark,
    securityNote: 'Requiere sesión activa para visualizar indicadores y contactos internos.',
  },
  agenda: {
    title: 'Agenda Institucional y Visitas Escolares',
    subtitle: 'Cronograma oficial de recintos, reservas de salas y contingentes',
    description:
      'Contiene datos confidenciales de instituciones educativas visitantes, nóminas de contingentes, docentes responsables, teléfonos de contacto y ocupación de recintos en vivo.',
    icon: Calendar,
    securityNote: 'Información protegida por protocolo de seguridad edilicia y de menores.',
  },
  recursos: {
    title: 'Repositorio Documental y Modelos Oficiales',
    subtitle: 'Notas modelo, resoluciones, protocolos de seguridad y plantillas',
    description:
      'Repositorio interno de documentos administrativos, modelos de notas parlamentarias, planillas de autorización y accesos a carpetas institucionales de Google Drive.',
    icon: FolderOpen,
    securityNote: 'Documentación de uso exclusivo para trámites internos del Instituto.',
  },
  equipo: {
    title: 'Directorio del Equipo y Personal',
    subtitle: 'Datos de contacto, áreas operativas, horarios y legajos del personal',
    description:
      'Por privacidad y resguardo de datos personales, los números telefónicos, correos electrónicos, domicilios, horarios laborales y fechas de cumpleaños del equipo solo son visibles para usuarios autenticados.',
    icon: Users,
    securityNote: 'Protegido bajo políticas de privacidad de datos del personal legislativo.',
  },
  enlaces: {
    title: 'Ecosistema Operativo y Google Workspace',
    subtitle: 'Accesos directos a planillas oficiales, formularios y sistemas internos',
    description:
      'Centraliza los enlaces operativos a Google Drive, Google Sheets de asistencia, formularios internos y tableros de diseño institucional.',
    icon: Link2,
    securityNote: 'Requiere validación de identidad para acceder a enlaces de trabajo.',
  },
  admin: {
    title: 'Panel de Administración Central',
    subtitle: 'Edición de parámetros institucionales, políticas de acceso y gestión del sistema',
    description:
      'Este panel es de acceso restringido y exclusivo para el Administrador del Sistema. Permite editar datos institucionales del Palacio, políticas de admisión y accesos rápidos.',
    icon: Shield,
    securityNote: 'Acceso estrictamente reservado para las cuentas de Administrador.',
  },
};

export function RestrictedAccessView({
  mode,
  moduleId = 'agenda',
  onOpenLoginModal,
  onNavigateTab,
  isLoggedIn = false,
}: RestrictedAccessViewProps) {
  // Se parte de los valores por defecto (igual en servidor y cliente) y se leen los guardados
  // después de montar, para no provocar un desajuste de hidratación.
  const [{ instituteName, institutionSubtitle }, setNames] = useState({
    instituteName: DEFAULT_SETTINGS.instituteName,
    institutionSubtitle: DEFAULT_SETTINGS.institutionSubtitle,
  });
  useEffect(() => {
    const saved = getInstitutionalSettings();
    setNames({ instituteName: saved.instituteName, institutionSubtitle: saved.institutionSubtitle });
  }, []);

  if (mode === 'module') {
    const mod = PROTECTED_MODULES[moduleId] || PROTECTED_MODULES.agenda;
    const IconComponent = mod.icon;

    return (
      <div className="py-6 sm:py-10 max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="bg-[#001428] px-6 py-5 text-white flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-sky-400 shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-sky-400">
                  Módulo Protegido • Intranet Privada
                </div>
                <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-white">
                  {mod.title}
                </h2>
              </div>
            </div>
            <Shield className="w-6 h-6 text-slate-400 shrink-0 hidden sm:block" />
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="w-9 h-9 rounded-lg bg-[#eff6ff] border border-[#bfdbfe] text-[#0284c7] flex items-center justify-center shrink-0 mt-0.5">
                <IconComponent className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-[#001428]">{mod.subtitle}</div>
                <p className="text-xs text-slate-600 leading-relaxed">{mod.description}</p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-amber-50/80 border border-amber-200 flex items-center gap-2.5 text-xs text-amber-900">
              <KeyRound className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="font-medium">
                {isLoggedIn
                  ? 'Tu cuenta no tiene permisos para este módulo. Si corresponde, ingresa con una cuenta de Administrador.'
                  : mod.securityNote}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => onNavigateTab('inicio')}
                className="px-4 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer text-center"
              >
                Volver a Portada Institucional
              </button>
              <button
                type="button"
                onClick={onOpenLoginModal}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#001428] hover:bg-[#0e4a7b] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                <LogIn className="w-4 h-4 text-sky-400" />
                <span>{isLoggedIn ? 'Cambiar de Cuenta' : 'Iniciar Sesión para Acceder'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Security Notice Banner */}
      <div className="bg-[#001428] text-white rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs border border-slate-800">
        <div className="flex items-center gap-2.5 text-xs">
          <div className="w-6 h-6 rounded-full bg-sky-500/20 border border-sky-400/30 flex items-center justify-center shrink-0">
            <Lock className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div>
            <span className="font-extrabold uppercase tracking-wider text-sky-400 mr-1.5">
              ACCESO RESTRINGIDO:
            </span>
            <span className="text-slate-200">
              La información operativa, agenda de visitas, legajos del equipo y documentos internos requieren iniciar sesión.
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenLoginModal}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#0284c7] hover:bg-sky-500 text-white text-xs font-bold transition-colors shrink-0 cursor-pointer"
        >
          <LogIn className="w-3.5 h-3.5" />
          <span>Iniciar Sesión</span>
        </button>
      </div>

      {/* Institutional Public Hero */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#eff6ff] text-[#0284c7] text-[11px] font-bold border border-[#bfdbfe]">
            <Building2 className="w-3 h-3 text-[#0284c7]" />
            <span className="uppercase tracking-wider">
              {instituteName} • {institutionSubtitle}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#001428] tracking-tight leading-tight">
            Portal de Trabajo y Gestión Interna Legislativa
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Bienvenido a la plataforma oficial de {instituteName}. Por políticas de seguridad y resguardo de información institucional, el acceso a cronogramas, nóminas escolares, documentación interna y directorio de agentes se encuentra habilitado únicamente para personal acreditado.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigateTab('instituto')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#001428] hover:bg-[#0e4a7b] text-white text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer group"
            >
              <span>Ver Identidad Institucional</span>
              <ArrowRight className="w-4 h-4 text-sky-400 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </section>

      {/* Protected Modules Grid */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold text-[#001428] tracking-tight">
              Módulos Internos Protegidos
            </h2>
            <p className="text-xs text-slate-500">
              Inicia sesión para desbloquear las herramientas operativas y bases de datos del Instituto
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-200/70 text-slate-700 text-[11px] font-bold">
            <Lock className="w-3 h-3 text-slate-500" />
            <span>Contenido Privado</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(PROTECTED_MODULES).map(([key, mod]) => {
            const IconComp = mod.icon;
            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                onClick={onOpenLoginModal}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenLoginModal();
                  }
                }}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs hover:shadow-md hover:border-[#0284c7] transition-all cursor-pointer group flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 group-hover:bg-[#001428] text-[#001428] group-hover:text-white flex items-center justify-center transition-colors">
                      <IconComp className="w-4 h-4" />
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                      <Lock className="w-2.5 h-2.5" />
                      <span>Requiere Sesión</span>
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-[#001428] group-hover:text-[#0284c7] transition-colors">
                    {mod.title}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">
                    {mod.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#0284c7]">
                  <span>Iniciar sesión para abrir</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
