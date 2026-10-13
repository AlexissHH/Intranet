'use client';

import React from 'react';
import { Calendar, FileSpreadsheet, Mail, CheckCircle2, AlertCircle, ArrowUpRight, LogIn } from 'lucide-react';
import type { UserProfile } from '@/lib/auth';

interface WorkspaceBannerProps {
  user: UserProfile | null;
  hasToken: boolean;
  onLogin: () => void;
}

export function WorkspaceBanner({
  user,
  hasToken,
  onLogin,
}: WorkspaceBannerProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 shadow-xs mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left Side: Status */}
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-blue-50 text-[#0284c7] text-[10px] font-bold uppercase tracking-wider border border-blue-200">
              Sincronización Institucional
            </span>
            {hasToken ? (
              <span className="flex items-center gap-1 text-xs text-emerald-700 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Google conectado: {user?.role === 'administrador' ? (user?.displayName || 'Administrador') : (user?.email || 'Cuenta Legislativa')} ({user?.role === 'administrador' ? 'Administrador' : 'Visitante'})
              </span>
            ) : user ? (
              <span className="flex items-center gap-1 text-xs text-slate-600 font-medium">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                Sesión: {user.displayName} • Rol: <strong className="text-slate-800 capitalize">{user.role}</strong>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
                Modo lectura pública • Inicia sesión para sincronizar y gestionar
              </span>
            )}
          </div>
          <h2 className="text-sm sm:text-base font-bold text-[#001428]">
            Ecosistema de Trabajo: Google Calendar, Sheets y Gmail
          </h2>
          <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
            Sincroniza visitas y capacitaciones con tu calendario oficial, genera reportes de asistencia en planillas de cálculo y prepara avisos institucionales.
          </p>
        </div>

        {/* Right Side: Tools status & Action */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded border border-slate-200 text-xs text-slate-700 font-medium">
            <Calendar className="w-3.5 h-3.5 text-[#0284c7]" />
            <span>Calendar</span>
            <span
              className={`w-2 h-2 rounded-full ${hasToken ? 'bg-emerald-500' : 'bg-slate-300'}`}
              title={hasToken ? 'Cuenta de Google conectada (requiere haber autorizado los permisos de Workspace)' : 'Sin conectar'}
            ></span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded border border-slate-200 text-xs text-slate-700 font-medium">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Sheets</span>
            <span
              className={`w-2 h-2 rounded-full ${hasToken ? 'bg-emerald-500' : 'bg-slate-300'}`}
              title={hasToken ? 'Cuenta de Google conectada (requiere haber autorizado los permisos de Workspace)' : 'Sin conectar'}
            ></span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded border border-slate-200 text-xs text-slate-700 font-medium">
            <Mail className="w-3.5 h-3.5 text-rose-500" />
            <span>Gmail</span>
            <span
              className={`w-2 h-2 rounded-full ${hasToken ? 'bg-emerald-500' : 'bg-slate-300'}`}
              title={hasToken ? 'Cuenta de Google conectada (requiere haber autorizado los permisos de Workspace)' : 'Sin conectar'}
            ></span>
          </div>

          {hasToken ? (
            // "Ver Calendario" antes disparaba la creación de un evento con la primera actividad de
            // la agenda; ahora simplemente abre Google Calendar.
            <a
              href="https://calendar.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#001428] hover:bg-[#122a45] text-white rounded transition-colors cursor-pointer"
            >
              <span>Ver Calendario</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          ) : (
            <button
              onClick={onLogin}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#001428] hover:bg-[#0e4a7b] text-white rounded transition-colors cursor-pointer shadow-xs"
            >
              <LogIn className="w-3.5 h-3.5 text-sky-400" />
              <span>{user ? 'Conectar Workspace' : 'Iniciar Sesión'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
