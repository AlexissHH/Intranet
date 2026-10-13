'use client';

import React, { useState, useMemo } from 'react';
import {
  Users,
  Mail,
  Phone,
  Clock,
  Cake,
  MapPin,
  Calendar,
  Bell,
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  MessageCircle,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { TeamMember } from '@/lib/mock-data';
import { getBirthdayCountdown } from '@/lib/utils';
import { useBottomSheetDrag } from '@/lib/useBottomSheetDrag';
import { BottomSheetHandle } from '@/components/BottomSheetHandle';

interface TeamSectionProps {
  team: TeamMember[];
  onSaveMember: (member: TeamMember) => void;
  onDeleteMember: (id: string) => void;
  onOpenEmailModal: (toEmail: string, subject: string, body?: string) => void;
  onSyncBirthdayToCalendar: (member: TeamMember) => Promise<void>;
  onSyncAllBirthdaysToCalendar: () => Promise<void>;
  isAdmin: boolean;
  hasWorkspaceAuth: boolean;
  onRequireAuth: () => void;
}

export function TeamSection({
  team,
  onSaveMember,
  onDeleteMember,
  onOpenEmailModal,
  onSyncBirthdayToCalendar,
  onSyncAllBirthdaysToCalendar,
  isAdmin,
  hasWorkspaceAuth,
  onRequireAuth,
}: TeamSectionProps) {
  const [selectedArea, setSelectedArea] = useState<string>('todas');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<TeamMember | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncingMemberId, setSyncingMemberId] = useState<string | null>(null);
  const [pushStatusMessage, setPushStatusMessage] = useState<string | null>(null);

  const memberSheet = useBottomSheetDrag({
    isOpen: isModalOpen,
    onClose: () => setIsModalOpen(false),
  });
  const deleteMemberSheet = useBottomSheetDrag({
    isOpen: Boolean(memberToDelete),
    onClose: () => setMemberToDelete(null),
    isAutoHeight: true,
  });

  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formArea, setFormArea] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formBirthday, setFormBirthday] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formSchedule, setFormSchedule] = useState('');
  const [formResponsibilities, setFormResponsibilities] = useState('');

  const areas = useMemo(() => {
    const list = Array.from(new Set(team.map((m) => m.area).filter(Boolean)));
    return ['todas', ...list];
  }, [team]);

  const memberBirthdays = useMemo(() => {
    return team.map((member) => ({
      member,
      countdown: getBirthdayCountdown(member.birthday),
    }));
  }, [team]);

  const upcomingBirthdays = useMemo(() => {
    return memberBirthdays
      .filter(({ countdown }) => countdown !== null && countdown.isWithin5Days)
      .sort((a, b) => (a.countdown?.daysLeft ?? 999) - (b.countdown?.daysLeft ?? 999));
  }, [memberBirthdays]);

  const filteredTeam = useMemo(() => {
    return team.filter((m) => {
      const matchArea = selectedArea === 'todas' || m.area === selectedArea;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        (m.name || '').toLowerCase().includes(q) ||
        (m.role || '').toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q) ||
        (m.location || '').toLowerCase().includes(q) ||
        (m.phone || '').includes(q);
      return matchArea && matchQuery;
    });
  }, [team, selectedArea, searchQuery]);

  const handleOpenCreateModal = () => {
    setEditingMember(null);
    setFormName('');
    setFormRole('');
    setFormArea('Dirección General');
    setFormEmail('');
    setFormPhone('');
    setFormBirthday('');
    setFormLocation('San Miguel de Tucumán');
    setFormSchedule('Lunes a Viernes de 08:00 a 14:00 hs');
    setFormResponsibilities('Coordinación institucional\nGestión de trámites y expedientes\nAtención a comisiones parlamentarias');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (member: TeamMember) => {
    setEditingMember(member);
    setFormName(member.name);
    setFormRole(member.role);
    setFormArea(member.area);
    setFormEmail(member.email);
    setFormPhone(member.phone);
    setFormBirthday(member.birthday);
    setFormLocation(member.location);
    setFormSchedule(member.schedule);
    setFormResponsibilities(member.responsibilities.join('\n'));
    setIsModalOpen(true);
  };

  React.useEffect(() => {
    if (!isModalOpen && !memberToDelete) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
        setMemberToDelete(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, memberToDelete]);

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formRole.trim() || !formEmail.trim()) return;

    const respArray = formResponsibilities
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r.length > 0);

    const savedMember: TeamMember = {
      id: editingMember ? editingMember.id : `team-${Date.now()}`,
      name: formName.trim(),
      role: formRole.trim(),
      area: formArea.trim() || 'Área General',
      email: formEmail.trim(),
      phone: formPhone.trim(),
      birthday: formBirthday.trim(),
      location: formLocation.trim() || 'Tucumán',
      schedule: formSchedule.trim() || 'Lunes a Viernes de 08:00 a 14:00 hs',
      responsibilities: respArray.length > 0 ? respArray : ['Funciones institucionales asignadas'],
      avatarSeed: formName.trim().split(' ')[0],
    };

    onSaveMember(savedMember);
    setIsModalOpen(false);
  };

  const handleTriggerPushNotification = async (member: TeamMember, daysLeft: number) => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) {
      setPushStatusMessage('Tu navegador no cuenta con soporte para Notificaciones Push de escritorio.');
      setTimeout(() => setPushStatusMessage(null), 4000);
      return;
    }

    try {
      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }
      if (permission === 'granted') {
        const title =
          daysLeft === 0
            ? `¡Hoy es el cumpleaños de ${member.name}!`
            : `Cumpleaños en ${daysLeft} días: ${member.name}`;
        const body = `Puesto: ${member.role}\nFecha: ${member.birthday}\nUbicación: ${member.location}\nContacto: ${member.phone} • ${member.email}`;
        new Notification(title, {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
        });
        setPushStatusMessage(`Notificación push emitida para ${member.name}`);
        setTimeout(() => setPushStatusMessage(null), 4000);
      } else {
        setPushStatusMessage('Permiso de notificaciones push bloqueado o no concedido en el navegador.');
        setTimeout(() => setPushStatusMessage(null), 4000);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setPushStatusMessage(`Error al emitir notificación push: ${msg}`);
      setTimeout(() => setPushStatusMessage(null), 4000);
    }
  };

  const handleSendGmailReminder = (member: TeamMember, daysLeft: number) => {
    const subject = `Recordatorio Institucional: Cumpleaños de ${member.name} (${member.birthday})`;
    const timing = daysLeft === 0 ? 'el día de hoy' : `en ${daysLeft} día${daysLeft > 1 ? 's' : ''}`;
    const body = `Estimado equipo del Instituto de Capacitación y Gestión Pública,\n\nLes recordamos que ${timing} celebra su cumpleaños nuestra compañera/o ${member.name} (${member.role}).\n\nDatos de contacto institucional:\n- Teléfono / WhatsApp: ${member.phone}\n- Correo electrónico: ${member.email}\n- Lugar de residencia: ${member.location}\n- Área: ${member.area}\n\n¡Un cordial saludo y felicitaciones!\n\nInstituto de Capacitación Legislativa\nHonorable Legislatura de Tucumán`;

    onOpenEmailModal(member.email, subject, body);
  };

  const handleSyncSingleCalendar = async (member: TeamMember) => {
    setSyncingMemberId(member.id);
    try {
      await onSyncBirthdayToCalendar(member);
    } finally {
      setSyncingMemberId(null);
    }
  };

  const handleSyncAllCalendar = async () => {
    setIsSyncingAll(true);
    try {
      await onSyncAllBirthdaysToCalendar();
    } finally {
      setIsSyncingAll(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 p-6 sm:p-7 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#eff6ff] text-[#0284c7] text-[11px] font-bold border border-[#bfdbfe]">
            <Users className="w-3 h-3 text-[#0284c7]" />
            <span className="uppercase tracking-wider">GABINETE & PLANTEL • DIRECTORIO Y CONTACTOS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#001428] tracking-tight">
            Directorio del Equipo Institucional
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Nómina oficial del personal, funciones laborales en el organismo, números de contacto, calendario anual de cumpleaños y sincronización con Google Workspace.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#001428] hover:bg-[#0e4a7b] text-white text-xs font-bold rounded-md shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 text-sky-400" />
              <span>Agregar Integrante</span>
            </button>
          )}
          {isAdmin && (
            <button
              onClick={hasWorkspaceAuth ? handleSyncAllCalendar : onRequireAuth}
              disabled={isSyncingAll}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold rounded-md shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              title="Agendar todos los cumpleaños con recurrencia anual en Google Calendar"
            >
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>{isSyncingAll ? 'Sincronizando...' : 'Sincronizar Cumpleaños en Calendar'}</span>
            </button>
          )}
        </div>
      </div>

      {pushStatusMessage && (
        <div className="bg-sky-50 border border-sky-300 text-sky-900 px-4 py-2.5 rounded-lg text-xs font-medium flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-sky-600" />
            <span>{pushStatusMessage}</span>
          </div>
          <button
            onClick={() => setPushStatusMessage(null)}
            className="text-sky-700 hover:text-sky-900 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {isAdmin && (upcomingBirthdays.length > 0 ? (
        <div className="bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-amber-500/10 border-2 border-amber-300 rounded-xl p-5 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-extrabold border border-amber-300">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-spin" style={{ animationDuration: '4s' }} />
                <span>ALERTA DE CUMPLEAÑOS • PRÓXIMOS 5 DÍAS</span>
              </div>
              <h2 className="text-base font-extrabold text-[#001428] flex items-center gap-2">
                <Cake className="w-5 h-5 text-amber-600" />
                ¡Próximos Cumpleaños en el Equipo!
              </h2>
              <p className="text-xs text-slate-600">
                Hay integrantes del equipo que celebran su cumpleaños en menos de 5 días. Puedes enviar una notificación push o redactar un correo conmemorativo por Gmail con un solo clic.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcomingBirthdays.map(({ member, countdown }) => {
              const daysLeft = countdown?.daysLeft ?? 0;
              const isToday = daysLeft === 0;
              return (
                <div
                  key={`upcoming-${member.id}`}
                  className="bg-white p-3.5 rounded-lg border border-amber-200 shadow-2xs flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-[#001428] leading-snug">
                        {member.name}
                      </h4>
                      <p className="text-[11px] text-[#0284c7] font-semibold">{member.role}</p>
                      <p className="text-[11px] text-slate-500">{member.location}</p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase shrink-0 ${
                        isToday
                          ? 'bg-rose-500 text-white animate-pulse'
                          : daysLeft === 1
                          ? 'bg-amber-500 text-white'
                          : 'bg-amber-100 text-amber-900 border border-amber-300'
                      }`}
                    >
                      {isToday ? (
                        <span className="inline-flex items-center gap-1">
                          <Cake className="w-3 h-3 text-white" />
                          <span>¡Es Hoy!</span>
                        </span>
                      ) : daysLeft === 1 ? (
                        <span className="inline-flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-white" />
                          <span>¡Es Mañana!</span>
                        </span>
                      ) : (
                        <span>Faltan {daysLeft} días</span>
                      )}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500 text-[11px]">
                      Fecha: <strong className="text-slate-800">{member.birthday}</strong>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleTriggerPushNotification(member, daysLeft)}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded text-[11px] font-bold transition-colors cursor-pointer"
                        title="Enviar Notificación Push del navegador"
                      >
                        <Bell className="w-3 h-3 text-amber-600" />
                        <span>Push</span>
                      </button>
                      <button
                        onClick={() => handleSendGmailReminder(member, daysLeft)}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-[#eff6ff] hover:bg-[#dbeafe] text-[#0284c7] border border-[#bfdbfe] rounded text-[11px] font-bold transition-colors cursor-pointer"
                        title="Redactar felicitación o recordatorio por Gmail"
                      >
                        <Mail className="w-3 h-3 text-[#0284c7]" />
                        <span>Gmail</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2.5">
            <Cake className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              <strong>Alerta de Cumpleaños activa:</strong> El sistema notifica automáticamente con 5 días de antelación cada cumpleaños del equipo.
            </span>
          </div>
          <button
            onClick={() => {
              if (team.length > 0) {
                handleTriggerPushNotification(team[0], 5);
              }
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-[11px] font-semibold cursor-pointer shrink-0"
          >
            <Bell className="w-3 h-3 text-slate-500" />
            <span>Probar Alerta Push</span>
          </button>
        </div>
      ))}

      <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por nombre, función laboral, WhatsApp, localidad..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#001428]"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {areas.map((area) => (
            <button
              key={area}
              onClick={() => setSelectedArea(area)}
              className={`px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer shrink-0 ${
                selectedArea === area
                  ? 'bg-[#001428] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {area === 'todas' ? 'Todo el Equipo' : area}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTeam.map((member) => {
          const countdown = getBirthdayCountdown(member.birthday);
          const isToday = countdown?.isToday;
          const daysLeft = countdown?.daysLeft ?? 999;
          const isWithin5Days = countdown?.isWithin5Days;

          return (
            <div
              key={member.id}
              className={`bg-white rounded-lg border p-5 shadow-xs flex flex-col justify-between transition-colors relative ${
                isWithin5Days ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="space-y-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded bg-[#001428] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs">
                      {member.name
                        .split(' ')
                        .map((n) => n[0])
                        .filter((c) => c === c.toUpperCase())
                        .slice(0, 2)
                        .join('')}
                    </div>
                    <div className="space-y-0.5">
                      <h3 className="text-sm font-bold text-[#001428] leading-tight">
                        {member.name}
                      </h3>
                      <p className="text-xs font-semibold text-[#0284c7]">
                        {member.role}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {member.area}
                      </p>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleOpenEditModal(member)}
                        className="p-1 text-slate-400 hover:text-[#0284c7] hover:bg-slate-100 rounded transition-colors cursor-pointer"
                        title="Editar integrante"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setMemberToDelete(member)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                        title="Eliminar del equipo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="p-2.5 bg-slate-50 rounded-md border border-slate-200 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-600 text-[11px]">
                      <Cake className="w-3.5 h-3.5 text-rose-500" />
                      <span>Cumpleaños:</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <strong className="text-[#001428] font-mono text-[11px]">{member.birthday}</strong>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          isToday
                            ? 'bg-rose-500 text-white animate-pulse'
                            : isWithin5Days
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {isToday ? (
                          <span className="inline-flex items-center gap-1">
                            <Cake className="w-2.5 h-2.5 text-white" />
                            <span>¡Hoy!</span>
                          </span>
                        ) : daysLeft <= 30 ? (
                          `en ${daysLeft} d`
                        ) : (
                          countdown?.formattedBirthday || ''
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-600 text-[11px]">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>Residencia:</span>
                    </span>
                    <span className="text-[11px] text-slate-700 font-medium truncate max-w-[170px]" title={member.location}>
                      {member.location}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-600 text-[11px]">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>Teléfono / WA:</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      {member.phone ? (
                        <>
                          <a
                            href={`tel:${member.phone.replace(/\s+/g, '')}`}
                            className="text-[#001428] font-mono text-[11px] hover:underline"
                          >
                            {member.phone}
                          </a>
                          <a
                            href={`https://wa.me/549${member.phone.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-600 hover:text-emerald-700 p-0.5"
                            title="Abrir chat de WhatsApp"
                          >
                            <MessageCircle className="w-3 h-3" />
                          </a>
                        </>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-medium">Sin teléfono</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-600 text-[11px]">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Horario:</span>
                    </span>
                    <span className="text-[11px] text-slate-700 font-medium">{member.schedule}</span>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Funciones y Responsabilidades:
                  </div>
                  <ul className="space-y-1 text-xs text-slate-700">
                    {member.responsibilities.map((resp, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="w-1 h-1 rounded-full bg-[#0284c7] shrink-0 mt-1.5"></span>
                        <span>{resp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between gap-1 text-[11px]">
                  <span className="font-mono text-slate-500 truncate max-w-[160px]" title={member.email}>
                    {member.email}
                  </span>
                  <button
                    onClick={() =>
                      onOpenEmailModal(
                        member.email,
                        `Comunicación institucional - Instituto de Capacitación`
                      )
                    }
                    className="inline-flex items-center gap-1 px-2 py-1 bg-[#eff6ff] hover:bg-[#dbeafe] text-[#0284c7] text-xs font-semibold rounded border border-[#bfdbfe] transition-colors cursor-pointer"
                  >
                    <Mail className="w-3 h-3" />
                    <span>Gmail</span>
                  </button>
                </div>

                {isAdmin && (
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-dashed border-slate-100">
                    <button
                      onClick={() => handleSyncSingleCalendar(member)}
                      disabled={syncingMemberId === member.id}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-emerald-700 transition-colors cursor-pointer disabled:opacity-50"
                      title="Agendar este cumpleaños en Google Calendar con repetición anual"
                    >
                      <Calendar className="w-3 h-3 text-emerald-600" />
                      <span>{syncingMemberId === member.id ? 'Agendando...' : 'Agendar Calendar'}</span>
                    </button>
                    <button
                      onClick={() => handleTriggerPushNotification(member, daysLeft)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-amber-700 transition-colors cursor-pointer"
                      title="Probar notificación push para este integrante"
                    >
                      <Bell className="w-3 h-3 text-amber-600" />
                      <span>Alerta Push</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden sm:overflow-y-auto overscroll-none"
        >
          <div
            data-bottom-sheet="true"
            style={memberSheet.sheetStyle}
            className="w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain h-[88dvh] sm:h-auto sm:max-h-[90vh] flex flex-col animate-in fade-in sm:zoom-in-95 duration-200"
          >
            <BottomSheetHandle
              {...memberSheet.dragBind}
              isExpanded={memberSheet.isExpanded}
              isDragging={memberSheet.isDragging}
            />
            <div
              {...memberSheet.dragBind}
              className="p-4 sm:p-6 pb-3 sm:pb-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 select-none touch-none sm:touch-auto cursor-grab active:cursor-grabbing sm:cursor-default"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Users className="w-5 h-5 text-[#001428] shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-[#001428] tracking-tight truncate">
                    {editingMember ? 'Editar Datos del Integrante' : 'Agregar Nuevo Integrante al Equipo'}
                  </h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                    Gestión del directorio y funciones del equipo institucional
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="hidden sm:flex text-slate-400 hover:text-slate-800 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ml-2"
                title="Cerrar ventana"
                aria-label="Cerrar ventana"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-4 sm:p-6 space-y-3.5 text-xs overflow-y-auto overscroll-contain flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Nombre y Apellido *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ej: Lic. María Pérez"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#001428]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Función / Puesto Laboral *</label>
                  <input
                    type="text"
                    required
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    placeholder="Ej: Coordinador de Visitas Escolares"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#001428]"
                  />
                  <p className="text-[10px] text-slate-400">Cargo o rol laboral que cumple en el organismo.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Área Institucional</label>
                  <input
                    type="text"
                    value={formArea}
                    onChange={(e) => setFormArea(e.target.value)}
                    placeholder="Ej: Capacitación y Formación"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#001428]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Correo Electrónico (Gmail) *</label>
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="nombre@gmail.com"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#001428]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Teléfono Celular / WhatsApp</label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="Ej: 3815814144"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#001428]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Fecha de Cumpleaños</label>
                  <input
                    type="text"
                    value={formBirthday}
                    onChange={(e) => setFormBirthday(e.target.value)}
                    placeholder="Ej: 19/03 o 05/01/1984"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#001428]"
                  />
                  <p className="text-[10px] text-slate-400">Día/Mes o Fecha completa para Google Calendar y alertas.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Lugar de Residencia / Domicilio</label>
                  <input
                    type="text"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="Ej: San Miguel de Tucumán"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#001428]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Horario Laboral</label>
                  <input
                    type="text"
                    value={formSchedule}
                    onChange={(e) => setFormSchedule(e.target.value)}
                    placeholder="Ej: Lunes a Viernes de 08:00 a 14:00 hs"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#001428]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Responsabilidades y Funciones (Una por línea)</label>
                <textarea
                  rows={3}
                  value={formResponsibilities}
                  onChange={(e) => setFormResponsibilities(e.target.value)}
                  placeholder="Coordinación logística de actos&#10;Atención telefónica a bloques&#10;Gestión de expedientes"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#001428] font-sans"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-full sm:w-auto text-center px-4 py-2.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#001428] hover:bg-[#122a45] text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs"
                >
                  {editingMember ? 'Guardar Cambios' : 'Registrar Integrante'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {memberToDelete && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setMemberToDelete(null);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden sm:overflow-y-auto overscroll-none"
        >
          <div
            data-bottom-sheet="true"
            style={deleteMemberSheet.sheetStyle}
            className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain max-h-[92dvh] sm:max-h-[90vh] flex flex-col animate-in fade-in sm:zoom-in-95 duration-200"
          >
            <BottomSheetHandle
              {...deleteMemberSheet.dragBind}
              isExpanded={deleteMemberSheet.isExpanded}
              isDragging={deleteMemberSheet.isDragging}
            />
            <div
              {...deleteMemberSheet.dragBind}
              className="p-4 sm:p-6 pb-3 sm:pb-4 bg-white border-b border-slate-100 flex items-start gap-3 shrink-0 select-none touch-none sm:touch-auto cursor-grab active:cursor-grabbing sm:cursor-default"
            >
              <div className="p-2 rounded-lg shrink-0 bg-rose-50 text-rose-600 border border-rose-200">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-[#001428] leading-snug">¿Eliminar integrante?</h3>
                <p className="text-xs mt-1 leading-relaxed text-slate-500">
                  Estás a punto de desvincular a <strong className="text-slate-700">{memberToDelete.name}</strong> ({memberToDelete.role}) del directorio institucional.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMemberToDelete(null)}
                className="hidden sm:flex text-slate-400 hover:text-slate-800 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ml-1"
                title="Cerrar ventana"
                aria-label="Cerrar ventana"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 sm:p-6 pt-3 flex items-center justify-end gap-2 bg-slate-50/50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setMemberToDelete(null)}
                className="px-4 py-2.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteMember(memberToDelete.id);
                  setMemberToDelete(null);
                }}
                className="px-4 py-2.5 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold cursor-pointer transition-colors shadow-xs"
              >
                Eliminar Integrante
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
