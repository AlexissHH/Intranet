'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Users,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Trash2,
  UserPlus,
  ToggleLeft,
  ToggleRight,
  Mail,
  User,
  Clock,
} from 'lucide-react';
import {
  AuthorizedUser,
  isMasterAdminEmail,
  getAuthorizedUsers,
  approveUser,
  rejectUser,
  deleteAuthorizedUser,
  addAuthorizedEmployee,
  getApprovalMode,
  setApprovalMode,
  USERS_STORAGE_KEY,
  APPROVAL_MODE_KEY,
} from '@/lib/auth';
import { useBottomSheetDrag } from '@/lib/useBottomSheetDrag';
import { BottomSheetHandle } from '@/components/BottomSheetHandle';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUsersUpdated?: () => void;
}

export function UserManagementModal({
  isOpen,
  onClose,
  onUsersUpdated,
}: UserManagementModalProps) {
  const [users, setUsers] = useState<AuthorizedUser[]>(() => getAuthorizedUsers());
  const [approvalMode, setModeState] = useState<'manual' | 'auto_visitor'>(() => getApprovalMode());
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'todos' | 'pendientes' | 'aprobados'>('todos');
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userSheet = useBottomSheetDrag({ isOpen, onClose });

  // Al abrir y en tiempo real: releer los datos ante cualquier cambio de Firestore
  useEffect(() => {
    if (!isOpen) return;
    setUsers(getAuthorizedUsers());
    setModeState(getApprovalMode());
    setPendingDeleteId(null);
    setErrorMessage(null);

    const handleStorage = (e: StorageEvent) => {
      if (!e.key || e.key === USERS_STORAGE_KEY || e.key === APPROVAL_MODE_KEY) {
        setUsers(getAuthorizedUsers());
        setModeState(getApprovalMode());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    };
  }, []);

  const flashSuccess = (message: string) => {
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    setErrorMessage(null);
    setSuccessMessage(message);
    messageTimerRef.current = setTimeout(() => setSuccessMessage(null), 4000);
  };

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const refreshUsers = () => {
    const current = getAuthorizedUsers();
    setUsers(current);
    if (onUsersUpdated) onUsersUpdated();
  };

  const handleApprove = (userId: string) => {
    approveUser(userId);
    refreshUsers();
    flashSuccess('Acceso aprobado exitosamente. El usuario ya puede ingresar como Visitante.');
  };

  const handleReject = (userId: string) => {
    rejectUser(userId);
    refreshUsers();
    flashSuccess('Acceso revocado/rechazado.');
  };

  const handleDelete = (userId: string) => {
    deleteAuthorizedUser(userId);
    setPendingDeleteId(null);
    refreshUsers();
    flashSuccess('Registro eliminado de la lista.');
  };

  const handleAddEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    const email = newEmail.trim();
    if (!email) return;
    if (isMasterAdminEmail(email)) {
      setSuccessMessage(null);
      setErrorMessage(`${email} ya es una cuenta de Administrador: no hace falta autorizarla como integrante.`);
      return;
    }
    try {
      addAuthorizedEmployee(email, newName.trim());
    } catch (err: any) {
      setSuccessMessage(null);
      setErrorMessage(err?.message || 'No se pudo autorizar al integrante.');
      return;
    }
    setNewEmail('');
    setNewName('');
    refreshUsers();
    flashSuccess(`Integrante ${email} autorizado directamente con rol Visitante (solo lectura).`);
  };

  const handleToggleMode = () => {
    const nextMode = approvalMode === 'manual' ? 'auto_visitor' : 'manual';
    setApprovalMode(nextMode);
    setModeState(nextMode);
  };

  const pendingCount = users.filter((u) => u.status === 'pendiente').length;
  const adminUsers = users.filter((u) => isMasterAdminEmail(u.email));
  const approvedCount = users.filter((u) => u.status === 'aprobado' && !isMasterAdminEmail(u.email)).length;

  const filteredUsers = users.filter((u) => {
    if (filter === 'pendientes') return u.status === 'pendiente';
    if (filter === 'aprobados') return u.status === 'aprobado';
    return true;
  });

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-management-title"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden sm:overflow-y-auto overscroll-none"
    >
      <div
        data-bottom-sheet="true"
        style={userSheet.sheetStyle}
        className="w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain h-[88dvh] sm:h-auto sm:max-h-[90vh] flex flex-col animate-in fade-in sm:zoom-in-95 duration-200"
      >
        <BottomSheetHandle
          {...userSheet.dragBind}
          isExpanded={userSheet.isExpanded}
          isDragging={userSheet.isDragging}
        />

        <div
          {...userSheet.dragBind}
          className="p-4 sm:p-6 pb-3 sm:pb-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 select-none touch-none sm:touch-auto cursor-grab active:cursor-grabbing sm:cursor-default"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Users className="w-5 h-5 text-[#001428] shrink-0" />
            <div className="min-w-0">
              <h3 id="user-management-title" className="text-sm sm:text-base font-bold text-[#001428] tracking-tight truncate">
                Control de Equipo y Aprobaciones
              </h3>
              <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                Panel exclusivo de las cuentas de Administrador
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="hidden sm:flex text-slate-400 hover:text-slate-800 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ml-2"
            title="Cerrar ventana"
            aria-label="Cerrar ventana"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 sm:p-5 overflow-y-auto flex-1 text-xs text-slate-800 space-y-4 sm:space-y-5">
          {errorMessage && (
            <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2 animate-in fade-in">
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg">
              <div className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                {adminUsers.length === 1 ? 'Administrador' : 'Administradores'}
              </div>
              <div className="text-sm font-extrabold text-[#001428] mt-0.5">
                {adminUsers.length} {adminUsers.length === 1 ? 'Cuenta' : 'Cuentas'}
              </div>
              <div className="text-[10px] text-amber-900 truncate">Acceso total (requiere Google)</div>
            </div>

            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg">
              <div className="text-[10px] font-bold text-[#0284c7] uppercase tracking-wider">
                Equipo Autorizado
              </div>
              <div className="text-sm font-extrabold text-[#001428] mt-0.5">
                {approvedCount} {approvedCount === 1 ? 'Integrante' : 'Integrantes'}
              </div>
              <div className="text-[10px] text-slate-500">Rol: Visitante (Solo Lectura)</div>
            </div>

            <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-lg">
              <div className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">
                Solicitudes Pendientes
              </div>
              <div className="text-sm font-extrabold text-rose-900 mt-0.5">
                {pendingCount} {pendingCount === 1 ? 'Pendiente' : 'Pendientes'}
              </div>
              <div className="text-[10px] text-rose-600">Requieren tu aprobación</div>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="font-bold text-xs text-[#001428]">
                Política de Registro para Nuevos Integrantes del Equipo
              </div>
              <p className="text-[11px] text-slate-500 max-w-md leading-relaxed">
                {approvalMode === 'manual'
                  ? 'Modo Estricto: Todo integrante que intente ingresar queda en estado "Pendiente" hasta que hagas clic en Aprobar.'
                  : 'Modo Directo: Todo integrante que ingrese con su Gmail queda habilitado de forma inmediata como Visitante (solo lectura).'}
              </p>
            </div>
            <button
              onClick={handleToggleMode}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                approvalMode === 'manual'
                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  : 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
              }`}
            >
              {approvalMode === 'manual' ? (
                <>
                  <ToggleLeft className="w-4 h-4 text-amber-700" />
                  <span>Aprobación Manual</span>
                </>
              ) : (
                <>
                  <ToggleRight className="w-4 h-4 text-emerald-600" />
                  <span>Aprobación Automática</span>
                </>
              )}
            </button>
          </div>

          <form onSubmit={handleAddEmployee} className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-3">
            <div className="flex items-center gap-1.5 font-bold text-xs text-[#001428]">
              <UserPlus className="w-3.5 h-3.5 text-[#0284c7]" />
              <span>Autorizar Integrante del Equipo en el Sistema</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Registra el correo de tu integrante del equipo para que pueda ingresar como Visitante (ver todo sin poder agregar nada):
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="um-new-name" className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Nombre del Integrante
                </label>
                <div className="relative">
                  <User className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="um-new-name"
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ej: Nombre y Apellido"
                    className="w-full text-xs pl-7 pr-3 py-1.5 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="um-new-email" className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Correo Electrónico (Gmail o Institucional) *
                </label>
                <div className="relative">
                  <Mail className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="um-new-email"
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="equipo@gmail.com"
                    className="w-full text-xs pl-7 pr-3 py-1.5 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-[#001428] hover:bg-[#0e4a7b] text-white rounded text-xs font-bold transition-colors cursor-pointer"
              >
                Guardar y Habilitar Integrante
              </button>
            </div>
          </form>

          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="font-bold text-xs text-[#001428] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-600" />
                <span>Listado de Usuarios Registrados ({users.length})</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFilter('todos')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                    filter === 'todos' ? 'bg-[#001428] text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Todos ({users.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('pendientes')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                    filter === 'pendientes' ? 'bg-rose-600 text-white' : 'text-rose-700 hover:bg-rose-50'
                  }`}
                >
                  Pendientes ({pendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('aprobados')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                    filter === 'aprobados' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Aprobados
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {filteredUsers.map((u) => {
                const isMaster = isMasterAdminEmail(u.email);
                return (
                  <div
                    key={u.id}
                    className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                      isMaster
                        ? 'bg-amber-50/50 border-amber-200'
                        : u.status === 'pendiente'
                        ? 'bg-rose-50/40 border-rose-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                          isMaster
                            ? 'bg-[#001428] text-amber-300'
                            : u.status === 'pendiente'
                            ? 'bg-rose-200 text-rose-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {(u.displayName || u.email).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 leading-tight">
                        <div className="font-bold text-xs text-[#001428] truncate flex items-center gap-1.5">
                          <span className="truncate">{u.displayName || u.email}</span>
                          {isMaster && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-extrabold uppercase">
                              ADMINISTRADOR
                            </span>
                          )}
                          {!isMaster && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[9px] font-bold uppercase">
                              VISITANTE (SOLO LECTURA)
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {isMaster ? `${u.email} • cuenta protegida` : u.email}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {isMaster ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                          <span>Activo Permanente</span>
                        </span>
                      ) : u.status === 'aprobado' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Habilitado</span>
                        </span>
                      ) : u.status === 'pendiente' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] font-bold border border-rose-200 animate-pulse">
                          <Clock className="w-3 h-3 text-rose-600" />
                          <span>Esperando Aprobación</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold border border-slate-200">
                          <XCircle className="w-3 h-3 text-slate-500" />
                          <span>Rechazado</span>
                        </span>
                      )}

                      {!isMaster && (
                        <div className="flex items-center gap-1">
                          {u.status !== 'aprobado' && (
                            <button
                              type="button"
                              onClick={() => handleApprove(u.id)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold transition-colors cursor-pointer"
                              title="Aprobar acceso como Visitante"
                            >
                              Aprobar
                            </button>
                          )}
                          {u.status === 'aprobado' && (
                            <button
                              type="button"
                              onClick={() => handleReject(u.id)}
                              className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded text-[11px] font-semibold transition-colors cursor-pointer"
                              title="Suspender acceso"
                            >
                              Suspender
                            </button>
                          )}
                          {pendingDeleteId === u.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleDelete(u.id)}
                                className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-bold transition-colors cursor-pointer"
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingDeleteId(null)}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold transition-colors cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPendingDeleteId(u.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                              title="Eliminar de la lista"
                              aria-label={`Eliminar a ${u.displayName || u.email} de la lista`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500">
          <span>Solo las cuentas de administración poseen privilegios de creación y gestión.</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded font-semibold text-xs cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
