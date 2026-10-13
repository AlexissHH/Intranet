'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  UserCheck,
  AlertCircle,
  LogIn,
  Loader2,
  Mail,
  User,
  KeyRound,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  Globe,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  googleSignIn,
  googleSignInWithRedirect,
  googleGisSignIn,
  institutionalSignIn,
  UserProfile,
  getStoredUserProfile,
  getStoredAccessToken,
  getEffectiveFirebaseConfig,
  getRememberedDeviceUser,
  saveRememberedDeviceUser,
  type RememberedDeviceUser,
} from '@/lib/auth';
import { getInstitutionalSettings } from '@/lib/storage';
import { useBottomSheetDrag } from '@/lib/useBottomSheetDrag';
import { BottomSheetHandle } from '@/components/BottomSheetHandle';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Si es true, al abrir viene tildada la opción de sincronizar Google Workspace. */
  workspaceIntent?: boolean;
  onLoginSuccess: (profile: UserProfile, token: string | null) => void;
}

export function LoginModal({
  isOpen,
  onClose,
  workspaceIntent = false,
  onLoginSuccess,
}: LoginModalProps) {
  const [activeTab, setActiveTab] = useState<'google' | 'direct'>('google');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGisLoading, setIsGisLoading] = useState(false);
  const [isRedirectLoading, setIsRedirectLoading] = useState(false);
  const [includeWorkspaceScopes, setIncludeWorkspaceScopes] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);

  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [showAlternativeForm, setShowAlternativeForm] = useState(false);

  const [rememberedUser, setRememberedUser] = useState<RememberedDeviceUser | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const isAnyLoading = isGoogleLoading || isGisLoading || isRedirectLoading;

  const loginSheet = useBottomSheetDrag({
    isOpen,
    onClose: () => {
      if (!isAnyLoading) onClose();
    },
  });

  // Load remembered user on device when modal opens
  useEffect(() => {
    if (isOpen) {
      // Estado limpio en cada apertura: no arrastrar errores ni avisos de un intento anterior.
      setErrorMsg(null);
      setErrorCode(null);
      setPendingNotice(null);
      setShowAlternativeForm(false);
      setIncludeWorkspaceScopes(workspaceIntent);
      const devUser = getRememberedDeviceUser();
      setRememberedUser(devUser);
      if (devUser?.email) {
        setCustomEmail(devUser.email);
        if (devUser.displayName) setCustomName(devUser.displayName);
      }
    }
  }, [isOpen, workspaceIntent]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isAnyLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isAnyLoading, onClose]);

  if (!isOpen) return null;

  const storedUser = typeof window !== 'undefined' ? getStoredUserProfile() : null;
  const hasStoredAdmin = storedUser && storedUser.role === 'administrador';
  const effectiveFbConfig = getEffectiveFirebaseConfig();
  const { instituteName, institutionSubtitle } = getInstitutionalSettings();

  const copyToClipboard = (text: string, key: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedField(key);
        setTimeout(() => setCopiedField(null), 2500);
      })
      .catch(() => {
        // Sin permiso de portapapeles: el dominio sigue visible para copiarlo a mano.
      });
  };

  const handleAuthError = (err: any) => {
    const code = err?.code || null;
    setErrorCode(code);
    if (code === 'auth/pending-approval') {
      setPendingNotice(
        err.message ||
          'Tu registro ha sido enviado al Administrador del Sistema. Podrás ingresar una vez que se apruebe tu acceso.'
      );
    } else {
      setErrorMsg(err?.message || 'Error al conectar con los servicios de autenticación.');
    }
  };

  const handleGoogleAuth = async () => {
    setIsGoogleLoading(true);
    setErrorMsg(null);
    setErrorCode(null);
    setPendingNotice(null);
    try {
      const result = await googleSignIn({
        includeWorkspaceScopes,
      });
      if (result) {
        saveRememberedDeviceUser({
          email: result.profile.email,
          displayName: result.profile.displayName,
          role: result.profile.role,
          status: result.profile.status,
        });
        onLoginSuccess(result.profile, result.accessToken);
        onClose();
      }
    } catch (err: any) {
      handleAuthError(err);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleGisAuth = async () => {
    setIsGisLoading(true);
    setErrorMsg(null);
    setErrorCode(null);
    setPendingNotice(null);
    try {
      const result = await googleGisSignIn(includeWorkspaceScopes);
      if (result) {
        saveRememberedDeviceUser({
          email: result.profile.email,
          displayName: result.profile.displayName,
          role: result.profile.role,
          status: result.profile.status,
        });
        onLoginSuccess(result.profile, result.accessToken);
        onClose();
      }
    } catch (err: any) {
      handleAuthError(err);
    } finally {
      setIsGisLoading(false);
    }
  };

  const handleRedirectAuth = async () => {
    setIsRedirectLoading(true);
    setErrorMsg(null);
    setErrorCode(null);
    setPendingNotice(null);
    try {
      await googleSignInWithRedirect(includeWorkspaceScopes);
    } catch (err: any) {
      handleAuthError(err);
      setIsRedirectLoading(false);
    }
  };

  const handleDirectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setErrorCode(null);
    setPendingNotice(null);

    const email = customEmail.trim();
    const name = customName.trim();

    if (!email) {
      setErrorMsg('Por favor introduce tu correo electrónico.');
      return;
    }

    try {
      const profile = institutionalSignIn({
        displayName: name,
        email: email,
      });
      saveRememberedDeviceUser({
        email: profile.email,
        displayName: profile.displayName,
        role: profile.role,
        status: profile.status,
      });
      onLoginSuccess(profile, null);
      onClose();
    } catch (err: any) {
      handleAuthError(err);
    }
  };

  const handleQuickResumeRemembered = () => {
    if (!rememberedUser) return;
    setErrorMsg(null);
    setErrorCode(null);
    setPendingNotice(null);

    if (hasStoredAdmin && storedUser?.email.toLowerCase() === rememberedUser.email.toLowerCase()) {
      onLoginSuccess(storedUser, getStoredAccessToken());
      onClose();
      return;
    }

    try {
      const profile = institutionalSignIn({
        displayName: rememberedUser.displayName,
        email: rememberedUser.email,
      });
      saveRememberedDeviceUser({
        email: profile.email,
        displayName: profile.displayName,
        role: profile.role,
        status: profile.status,
      });
      onLoginSuccess(profile, null);
      onClose();
    } catch (err: any) {
      handleAuthError(err);
    }
  };

  const handleResumeStoredAdmin = () => {
    if (!storedUser || storedUser.role !== 'administrador') return;
    onLoginSuccess(storedUser, getStoredAccessToken());
    onClose();
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isAnyLoading) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
      className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden sm:overflow-y-auto overscroll-none"
    >
      <div
        data-bottom-sheet="true"
        style={loginSheet.sheetStyle}
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain h-[88dvh] sm:h-auto sm:max-h-[92vh] flex flex-col animate-in fade-in sm:zoom-in-95 duration-200"
      >
        <BottomSheetHandle
          {...loginSheet.dragBind}
          isExpanded={loginSheet.isExpanded}
          isDragging={loginSheet.isDragging}
        />
        <div
          {...loginSheet.dragBind}
          className="p-4 sm:p-6 pb-3 sm:pb-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 select-none touch-none sm:touch-auto cursor-grab active:cursor-grabbing sm:cursor-default"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Shield className="w-5 h-5 text-[#001428] shrink-0" />
            <div className="min-w-0">
              <h3 id="login-modal-title" className="text-sm sm:text-base font-bold text-[#001428] tracking-tight truncate">
                Acceso Institucional
              </h3>
              <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                Intranet de {instituteName}
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

        <div className="p-3.5 sm:p-5 overflow-y-auto flex-1 text-xs text-slate-800 space-y-4">
          {pendingNotice && (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2 animate-in fade-in">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold block">Solicitud de Acceso Registrada</span>
                  <p className="text-[11px] text-amber-800 leading-relaxed">{pendingNotice}</p>
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-2.5 animate-in fade-in">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <span className="font-semibold leading-relaxed block">{errorMsg}</span>
                </div>
              </div>

              {errorCode === 'auth/unauthorized-domain' && (
                <div className="p-2.5 rounded bg-white border border-rose-200 text-[11px] text-slate-700 space-y-2">
                  <div className="font-bold text-[#001428]">
                    ¿Cómo autorizar este dominio en tu consola de Firebase?
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-600">
                    <li>
                      Copia el dominio actual:{' '}
                      <code className="px-1.5 py-0.5 bg-slate-100 rounded font-mono font-bold text-[#001428]">
                        {effectiveFbConfig.hostname}
                      </code>
                    </li>
                    <li>
                      En <strong>Firebase Console → Authentication → Settings → Authorized domains</strong>, haz clic en <strong>Add domain</strong> y pégalo.
                    </li>
                  </ol>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(effectiveFbConfig.hostname, 'err-domain')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#001428] text-white text-[10px] font-bold cursor-pointer hover:bg-[#0e4a7b]"
                    >
                      {copiedField === 'err-domain' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Dominio copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar {effectiveFbConfig.hostname}</span>
                        </>
                      )}
                    </button>
                    <a
                      href={`https://console.firebase.google.com/project/${effectiveFbConfig.config.projectId}/authentication/settings`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[#001428] text-[10px] font-bold"
                    >
                      <span>Abrir Firebase Console</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <div className="flex overflow-x-auto border-b border-slate-200 gap-3 text-xs font-semibold mb-3 no-scrollbar">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setPendingNotice(null);
                  setActiveTab('google');
                }}
                className={`pb-2 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'google'
                    ? 'border-[#0284c7] text-[#001428] font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Cuenta Google</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setPendingNotice(null);
                  setActiveTab('direct');
                }}
                className={`pb-2 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'direct'
                    ? 'border-[#0284c7] text-[#001428] font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Acceso Rápido</span>
              </button>
            </div>

            {activeTab === 'google' && (
              <div className="space-y-3 pt-1">
                <p className="text-slate-600 text-xs leading-relaxed">
                  Inicia sesión con tu cuenta de <strong>Google o Gmail</strong> para acceder a los módulos internos y herramientas de la intranet.
                </p>

                {/* Primary Google Sign-In Button */}
                <button
                  type="button"
                  onClick={handleGoogleAuth}
                  disabled={isAnyLoading}
                  className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 flex items-center justify-center gap-2.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isGoogleLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#0284c7]" />
                      <span>Conectando con Google...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.14z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                        />
                      </svg>
                      <span>Continuar con Google</span>
                    </>
                  )}
                </button>

                {/* Scope mode selector */}
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeWorkspaceScopes}
                      onChange={(e) => setIncludeWorkspaceScopes(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-[#0284c7] focus:ring-[#0284c7]"
                    />
                    <div className="text-[11px] leading-snug">
                      <span className="font-bold text-[#001428] block">
                        Sincronizar permisos de Google Workspace (Calendar, Sheets y Gmail)
                      </span>
                      <span className="text-slate-500 text-[10px]">
                        Habilita la integración directa de actividades parlamentarias y envío de correos institucionales.
                      </span>
                    </div>
                  </label>
                </div>

                {/* Alternative connection methods */}
                <div className="pt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleGisAuth}
                    disabled={isAnyLoading}
                    className="py-2 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[#001428] text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                    title="Ideal para entornos embebidos o navegadores con bloqueo de terceros"
                  >
                    {isGisLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0284c7]" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-[#0284c7]" />
                    )}
                    <span>Acceso OAuth Directo (GIS)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRedirectAuth}
                    disabled={isAnyLoading}
                    className="py-2 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[#001428] text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                    title="Ideal si el navegador móvil bloquea las ventanas emergentes"
                  >
                    {isRedirectLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0284c7]" />
                    ) : (
                      <Globe className="w-3.5 h-3.5 text-slate-600" />
                    )}
                    <span>Iniciar por Redirección (Sin Popup)</span>
                  </button>
                </div>

                <div className="pt-1">
                  <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>
                      Los integrantes autorizados del equipo parlamentario ingresan de forma segura.
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'direct' && (
              <div className="space-y-4 pt-1">
                {/* Device-remembered account card */}
                {rememberedUser?.email ? (
                  <div className="p-3.5 rounded-xl border border-sky-200 bg-sky-50/70 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4 text-[#0284c7]" />
                        <span className="font-bold text-xs text-[#001428]">
                          Cuenta Registrada en este Dispositivo
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          rememberedUser.role === 'administrador'
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-sky-100 text-sky-900 border-sky-300'
                        }`}
                      >
                        {rememberedUser.role === 'administrador' ? 'Administrador' : 'Visitante'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-white border border-sky-100 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-[#001428] text-white flex items-center justify-center font-bold text-xs shrink-0">
                          {rememberedUser.displayName?.charAt(0)?.toUpperCase() ||
                            rememberedUser.email.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 leading-tight">
                          <div className="font-bold text-xs text-[#001428] truncate">
                            {rememberedUser.displayName || 'Usuario'}
                          </div>
                          <div className="text-[11px] text-slate-600 font-mono truncate mt-0.5">
                            {rememberedUser.email}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0 hidden sm:inline">
                        Recordada en este equipo
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleQuickResumeRemembered}
                      disabled={isAnyLoading}
                      className="w-full py-2.5 px-4 bg-[#001428] hover:bg-[#0e4a7b] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                    >
                      <Zap className="w-3.5 h-3.5 text-sky-400" />
                      <span>Ingresar con {rememberedUser.email}</span>
                    </button>

                    <div className="text-center pt-0.5">
                      <button
                        type="button"
                        onClick={() => setShowAlternativeForm(!showAlternativeForm)}
                        className="text-[11px] text-[#0284c7] hover:underline font-semibold cursor-pointer"
                      >
                        {showAlternativeForm ? 'Ocultar otro correo' : 'Ingresar con otro correo'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1">
                    <div className="text-xs font-bold text-[#001428] flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-slate-600" />
                      <span>Ingreso Directo / Registro en este Equipo</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      Introduce tu correo institucional o personal para iniciar sesión y registrar tu acceso en este dispositivo.
                    </p>
                  </div>
                )}

                {/* Email entry form (shows if no remembered user, or if toggled) */}
                {(!rememberedUser?.email || showAlternativeForm) && (
                  <form onSubmit={handleDirectSubmit} className="space-y-3 pt-1">
                    <div>
                      <label htmlFor="login-name" className="block text-xs font-bold text-[#001428] mb-1">
                        Nombre y Apellido
                      </label>
                      <div className="relative">
                        <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          id="login-name"
                          type="text"
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          placeholder="Ej: Nombre y Apellido"
                          className="w-full text-xs pl-8 pr-3 py-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="login-email" className="block text-xs font-bold text-[#001428] mb-1">
                        Correo Electrónico (Gmail o Institucional) *
                      </label>
                      <div className="relative">
                        <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          id="login-email"
                          type="email"
                          required
                          value={customEmail}
                          onChange={(e) => setCustomEmail(e.target.value)}
                          placeholder="tu_correo@gmail.com"
                          className="w-full text-xs pl-8 pr-3 py-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isAnyLoading}
                      className="w-full py-2.5 bg-[#001428] hover:bg-[#0e4a7b] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      Ingresar al Portal
                    </button>
                  </form>
                )}

                {hasStoredAdmin && !rememberedUser && (
                  <div className="pt-2 border-t border-slate-200">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Sesión activa en este equipo:
                    </div>
                    <button
                      type="button"
                      onClick={handleResumeStoredAdmin}
                      className="w-full p-2.5 rounded border border-amber-200 bg-amber-50/60 hover:bg-amber-100/60 text-left transition-colors cursor-pointer flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-xs text-[#001428] flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-amber-700" />
                          <span>Reanudar Sesión de Administrador</span>
                        </div>
                        <div className="text-[10px] text-amber-800">
                          {storedUser.displayName || 'Administrador'} (sesión de Google guardada)
                        </div>
                      </div>
                      <span className="px-2 py-0.5 bg-amber-200/80 text-amber-900 rounded text-[9px] font-extrabold uppercase">
                        Reanudar
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-200 text-center text-[10px] text-slate-500">
          {institutionSubtitle} • {instituteName}
        </div>
      </div>
    </div>
  );
}
