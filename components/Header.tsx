'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  LogOut,
  Calendar,
  Search,
  Bell,
  Lock,
  FolderOpen,
  FileSpreadsheet,
  FileCheck2,
  Mail,
  LogIn,
  Users,
  PlusCircle,
} from 'lucide-react';
import type { UserProfile } from '@/lib/auth';
import { LegislaturaLogo } from '@/components/LegislaturaLogo';
import { INSTITUTIONAL_TIMEZONE } from '@/lib/utils';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: UserProfile | null;
  onOpenLoginModal: () => void;
  onLogout: () => void;
  onOpenUserManagement?: () => void;
  pendingApprovalsCount?: number;
  isLoggingIn: boolean;
  onOpenQuickActions: () => void;
  hasWorkspaceToken: boolean;
  onSearch?: (query: string) => void;
}

export function Header({
  activeTab,
  setActiveTab,
  user,
  onOpenLoginModal,
  onLogout,
  onOpenUserManagement,
  pendingApprovalsCount = 0,
  isLoggingIn,
  onOpenQuickActions,
  hasWorkspaceToken,
  onSearch,
}: HeaderProps) {
  // Vacío hasta montar: antes mostraba una fecha fija inventada en el primer render.
  const [currentDateFormatted, setCurrentDateFormatted] = useState<string>('');
  const [searchVal, setSearchVal] = useState('');

  useEffect(() => {
    const updateDate = () => {
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: INSTITUTIONAL_TIMEZONE,
      };
      const formatted = new Date().toLocaleDateString('es-AR', options);
      setCurrentDateFormatted(formatted.charAt(0).toUpperCase() + formatted.slice(1));
    };
    updateDate();
    // Si la pestaña queda abierta pasada la medianoche, la fecha se actualiza sola.
    const timer = setInterval(updateDate, 60_000);
    return () => clearInterval(timer);
  }, []);

  const navItems = [
    { id: 'inicio', label: 'Inicio', restricted: false },
    { id: 'instituto', label: 'Instituto', restricted: false },
    { id: 'capacitacion', label: 'Capacitación', restricted: true },
    { id: 'programas', label: 'Programas y Proyectos', restricted: true },
    { id: 'agenda', label: 'Agenda', restricted: true },
    { id: 'recursos', label: 'Recursos', restricted: true },
    { id: 'equipo', label: 'Equipo', restricted: true },
    { id: 'enlaces', label: 'Enlaces', restricted: true },
    ...(user?.role === 'administrador'
      ? [{ id: 'admin', label: 'Panel', restricted: true }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
      {/* Top Header Bar */}
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <button
          type="button"
          onClick={() => setActiveTab('inicio')}
          aria-label="Ir al inicio"
          className="flex items-center gap-2.5 cursor-pointer shrink-0 group text-left"
        >
          <LegislaturaLogo size="md" className="group-hover:scale-105" />
          <div>
            <div className="text-base font-extrabold text-[#001428] leading-tight tracking-tight group-hover:text-[#0284c7] transition-colors">
              Intranet Instituto
            </div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-[#0284c7]">
              Poder Legislativo
            </div>
          </div>
        </button>

        {/* Center: Date, Search, and Workspace pill */}
        <div className="hidden md:flex items-center gap-3 flex-1 justify-center max-w-3xl">
          {/* Date pill */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 whitespace-nowrap">
            <Calendar className="w-3.5 h-3.5 text-[#0284c7]" />
            <span suppressHydrationWarning>{currentDateFormatted || '\u00A0'}</span>
          </div>

          {user ? (
            <>
              {/* Search box */}
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchVal}
                  onChange={(e) => {
                    setSearchVal(e.target.value);
                    if (onSearch) onSearch(e.target.value);
                  }}
                  placeholder="Buscar documentos y recursos..."
                  aria-label="Buscar en recursos y documentos"
                  className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-100/70 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0284c7] focus:bg-white text-slate-800 placeholder-slate-400 transition-colors"
                />
              </div>

              {/* Workspace Integrations Toolbar */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10px] text-slate-500 font-bold">
                <span className="uppercase tracking-wider text-[9px] text-slate-400 mr-1">Workspace</span>
                <Lock className="w-3 h-3 text-slate-400" />
                <div className="h-3 w-px bg-slate-200 mx-0.5" />
                <a href="https://drive.google.com" target="_blank" rel="noreferrer" title="Google Drive" className="hover:text-blue-600 transition-colors">
                  <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                </a>
                <a href="https://docs.google.com/spreadsheets" target="_blank" rel="noreferrer" title="Google Sheets" className="hover:text-emerald-600 transition-colors">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                </a>
                <a href="https://docs.google.com/forms" target="_blank" rel="noreferrer" title="Google Forms" className="hover:text-purple-600 transition-colors">
                  <FileCheck2 className="w-3.5 h-3.5 text-purple-600" />
                </a>
                <a href="https://calendar.google.com" target="_blank" rel="noreferrer" title="Google Calendar" className="hover:text-blue-600 transition-colors">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                </a>
                <a href="https://mail.google.com" target="_blank" rel="noreferrer" title="Gmail" className="hover:text-rose-600 transition-colors">
                  <Mail className="w-3.5 h-3.5 text-rose-500" />
                </a>
                {hasWorkspaceToken && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-0.5" title="Sincronizado con Google Workspace" />
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900 font-medium">
              <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Vista pública restringida • Inicie sesión para acceder a la Intranet</span>
            </div>
          )}
        </div>

        {/* Right: Notifications & User profile */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Quick Action Button for Admin */}
          {user?.role === 'administrador' && (
            <button
              onClick={onOpenQuickActions}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-[#0e4a7b] hover:bg-[#001428] rounded-md transition-colors cursor-pointer shadow-2xs"
              title="Carga rápida de visitas y actividades"
            >
              <PlusCircle className="w-3.5 h-3.5 text-sky-300" />
              <span className="text-[11px]">Trámite</span>
            </button>
          )}

          {/* Notification Bell (only for authenticated users) */}
          {user && (
            <button
              onClick={() => setActiveTab('agenda')}
              className="relative p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              title="Ir a la agenda"
              aria-label="Ir a la agenda"
            >
              <Bell className="w-4 h-4" />
            </button>
          )}

          {/* User profile capsule */}
          {user ? (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              {user.photoURL ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Usuario'}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-full border border-slate-300 object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#001428] text-white flex items-center justify-center font-bold text-xs uppercase shadow-xs">
                  {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                </div>
              )}
              <div className="hidden lg:block text-left text-xs leading-tight">
                <div className="font-bold text-[#001428] truncate max-w-[140px]">
                  {user.displayName}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded border ${
                      user.role === 'administrador'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                    title={user.role === 'administrador' ? 'Control Total de la Intranet' : 'Modo Consulta - Solo Lectura'}
                  >
                    {user.role === 'administrador' ? 'Administrador' : 'Visitante (Consulta)'}
                  </span>
                  {user.role === 'administrador' && onOpenUserManagement && (
                    <button
                      onClick={onOpenUserManagement}
                      className="text-[9px] text-[#0284c7] hover:underline cursor-pointer flex items-center gap-0.5 font-bold"
                      title="Administrar equipo y autorizaciones"
                    >
                      <Users className="w-2.5 h-2.5" />
                      <span>Equipo{pendingApprovalsCount > 0 ? ` (${pendingApprovalsCount} pend.)` : ''}</span>
                    </button>
                  )}
                </div>
              </div>
              <button
                // Sin pasar el evento: onLogout recibe un parámetro opcional `silent` y, con el
                // evento, tomaba "true" y cerraba la sesión sin avisar.
                onClick={() => onLogout()}
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-slate-100 transition-colors cursor-pointer ml-1"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <button
                onClick={onOpenLoginModal}
                disabled={isLoggingIn}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#001428] hover:bg-[#0e4a7b] text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 text-sky-400" />
                <span>{isLoggingIn ? 'Conectando...' : 'Iniciar Sesión'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sub-navigation Menu */}
      <nav className="border-t border-slate-200/80 bg-white">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 flex items-center gap-6 overflow-x-auto scrollbar-none">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const isLocked = !user && item.restricted;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`py-2 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap border-b-2 inline-flex items-center gap-1.5 ${
                  isActive
                    ? 'border-[#0284c7] text-[#001428]'
                    : 'border-transparent text-slate-600 hover:text-[#001428]'
                }`}
              >
                <span>{item.label}</span>
                {isLocked && <Lock className="w-3 h-3 text-slate-400" />}
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
