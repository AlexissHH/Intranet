'use client';

import React, { useState, useEffect } from 'react';
import {
  Compass,
  Target,
  Scale,
  GraduationCap,
  Users,
  Cpu,
  FileCheck2,
  Building2,
  Shield,
  ArrowRight,
  Award,
  BookOpen,
  Landmark,
  MapPin,
  Clock,
  Mail,
  Phone,
} from 'lucide-react';
import { getInstituteAreas, getInstitutionalSettings, DEFAULT_SETTINGS, type InstitutionalSettings } from '@/lib/storage';
import type { InstituteAreaCard, InstituteAreaIconName } from '@/lib/mock-data';

interface InstituteSectionProps {
  onNavigateTab: (tab: string, subTab?: string) => void;
  isAdmin?: boolean;
  instSettings?: InstitutionalSettings;
}

const ICON_MAP: Record<InstituteAreaIconName, React.ComponentType<{ className?: string }>> = {
  Scale,
  GraduationCap,
  Users,
  Cpu,
  FileCheck2,
  Building2,
  Shield,
  Compass,
  Target,
  Award,
  BookOpen,
  Landmark,
};

export function InstituteSection({ onNavigateTab, isAdmin, instSettings: propSettings }: InstituteSectionProps) {
  const [areas, setAreas] = useState<InstituteAreaCard[]>(() => getInstituteAreas());
  const [internalSettings, setInternalSettings] = useState<InstitutionalSettings>(() => propSettings || getInstitutionalSettings());

  useEffect(() => {
    if (propSettings) {
      setInternalSettings(propSettings);
    }
  }, [propSettings]);

  useEffect(() => {
    setAreas(getInstituteAreas());
    if (!propSettings) {
      setInternalSettings(getInstitutionalSettings());
    }
    const handleStorageChange = () => {
      setAreas(getInstituteAreas());
      setInternalSettings(getInstitutionalSettings());
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [propSettings]);

  const instSettings = propSettings || internalSettings;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="max-w-4xl space-y-3">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#eff6ff] text-[#0284c7] text-[11px] font-bold border border-[#bfdbfe]">
              <Building2 className="w-3 h-3 text-[#0284c7]" />
              <span className="uppercase tracking-wider">
                {instSettings.institutionSubtitle || 'PODER LEGISLATIVO'} • IDENTIDAD Y GOBERNANZA
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#001428] tracking-tight">
              {instSettings.instituteName || 'Instituto de Capacitación y Gestión Pública'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-3xl">
              {instSettings.description || 'Plataforma de coordinación pedagógica, extensión cívica y administración de expedientes formativos para agentes parlamentarios.'}
            </p>

            {/* Fila Informativa de Datos Institucionales */}
            <div className="pt-2 flex flex-wrap items-center gap-y-2 gap-x-4 text-xs text-slate-600 border-t border-slate-100">
              {instSettings.address && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#0284c7]" />
                  <span>{instSettings.address}{instSettings.city ? `, ${instSettings.city}` : ''}</span>
                </span>
              )}
              {instSettings.operatingHours && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#0284c7]" />
                  <span>{instSettings.operatingHours}</span>
                </span>
              )}
              {instSettings.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-[#0284c7]" />
                  <span>{instSettings.phone}</span>
                </span>
              )}
              {instSettings.contactEmail && (
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[#0284c7]" />
                  <a href={`mailto:${instSettings.contactEmail}`} className="text-[#0284c7] hover:underline font-semibold">
                    {instSettings.contactEmail}
                  </a>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Misión Institucional */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-xs space-y-3 relative group">
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded bg-[#eff6ff] text-[#0284c7] flex items-center justify-center border border-[#bfdbfe]">
              <Compass className="w-4 h-4 text-[#0284c7]" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#0284c7]">
              {instSettings.missionTag || 'PROPÓSITO PERMANENTE'}
            </div>
            <h3 className="text-sm font-bold text-[#001428]">
              {instSettings.missionTitle || 'Misión Institucional'}
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            {instSettings.missionText ||
              'Capacitar, profesionalizar y brindar asistencia técnica a los cuadros parlamentarios y administrativos de la Cámara, garantizando excelencia técnica, rigor normativo y vocación de servicio republicano.'}
          </p>
        </div>

        {/* Card 2: Objetivos de Gestión */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-xs space-y-3 relative group">
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded bg-[#eff6ff] text-[#0284c7] flex items-center justify-center border border-[#bfdbfe]">
              <Target className="w-4 h-4 text-[#0284c7]" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#0284c7]">
              {instSettings.objectivesTag || 'METAS ESTRATÉGICAS'}
            </div>
            <h3 className="text-sm font-bold text-[#001428]">
              {instSettings.objectivesTitle || 'Objetivos de Gestión'}
            </h3>
          </div>
          <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
            {(instSettings.objectivesList && instSettings.objectivesList.length > 0
              ? instSettings.objectivesList
              : DEFAULT_SETTINGS.objectivesList || []
            ).map((obj, i) => (
              <li key={i}>{obj}</li>
            ))}
          </ul>
        </div>

        {/* Card 3: Principios Rectores */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-xs space-y-3 relative group">
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded bg-[#eff6ff] text-[#0284c7] flex items-center justify-center border border-[#bfdbfe]">
              <Shield className="w-4 h-4 text-[#0284c7]" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#0284c7]">
              {instSettings.principlesTag || 'MARCO ÉTICO'}
            </div>
            <h3 className="text-sm font-bold text-[#001428]">
              {instSettings.principlesTitle || 'Principios Rectores'}
            </h3>
          </div>
          <ul className="text-xs text-slate-600 space-y-1.5">
            {(instSettings.principlesList && instSettings.principlesList.length > 0
              ? instSettings.principlesList
              : DEFAULT_SETTINGS.principlesList || []
            ).map((p, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0284c7] mt-1.5 shrink-0"></span>
                <span>
                  <strong className="text-[#001428]">{p.title}:</strong> {p.desc}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#0284c7]">
              ESTRUCTURA ORGANIZACIONAL
            </div>
            <h2 className="text-base sm:text-lg font-bold text-[#001428]">
              Organigrama y Áreas Operativas
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <button
              onClick={() => onNavigateTab('equipo')}
              className="text-xs font-semibold text-slate-600 hover:text-[#001428] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Ver Directorio & Equipo</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {areas.map((area, idx) => {
            const Icon = (area.iconName && ICON_MAP[area.iconName]) || Building2;
            return (
              <div
                key={area.id || idx}
                className="p-4 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors bg-white flex flex-col justify-between space-y-3 relative group"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="w-8 h-8 rounded bg-[#001428] text-white flex items-center justify-center font-bold shadow-xs">
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#0284c7] px-2 py-0.5 rounded bg-blue-50 border border-blue-200">
                      {area.tag}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#001428]">{area.title}</h4>
                    <p className="text-[11px] font-semibold text-[#0284c7]">{area.role}</p>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {area.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
