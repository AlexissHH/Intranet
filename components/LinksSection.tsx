'use client';

import React, { useState } from 'react';
import {
  Link2,
  ExternalLink,
  PlusCircle,
  FolderOpen,
  FileSpreadsheet,
  FileCheck2,
  Calendar,
  Mail,
  Palette,
  Globe,
  Trash2,
  X,
  FileText,
  Edit2,
} from 'lucide-react';
import { QuickLink } from '@/lib/mock-data';
import { useBottomSheetDrag } from '@/lib/useBottomSheetDrag';
import { BottomSheetHandle } from '@/components/BottomSheetHandle';

const LINK_ICON_OPTIONS = [
  {
    type: 'drive' as const,
    label: 'Google Drive (Archivos y Nube)',
    sublabel: 'Drive',
    icon: FolderOpen,
    color: 'text-amber-500',
    bgLight: 'bg-amber-50',
  },
  {
    type: 'sheets' as const,
    label: 'Google Sheets (Planillas y Métricas)',
    sublabel: 'Sheets',
    icon: FileSpreadsheet,
    color: 'text-emerald-600',
    bgLight: 'bg-emerald-50',
  },
  {
    type: 'forms' as const,
    label: 'Google Forms (Formularios y Consultas)',
    sublabel: 'Forms',
    icon: FileCheck2,
    color: 'text-purple-600',
    bgLight: 'bg-purple-50',
  },
  {
    type: 'calendar' as const,
    label: 'Google Calendar (Agenda Oficial)',
    sublabel: 'Calendar',
    icon: Calendar,
    color: 'text-[#0284c7]',
    bgLight: 'bg-sky-50',
  },
  {
    type: 'gmail' as const,
    label: 'Gmail (Correo Institucional)',
    sublabel: 'Gmail',
    icon: Mail,
    color: 'text-rose-500',
    bgLight: 'bg-rose-50',
  },
  {
    type: 'canva' as const,
    label: 'Canva (Diseño y Comunicación)',
    sublabel: 'Canva',
    icon: Palette,
    color: 'text-indigo-500',
    bgLight: 'bg-indigo-50',
  },
  {
    type: 'globe' as const,
    label: 'Portal Web Institucional',
    sublabel: 'Portal Web',
    icon: Globe,
    color: 'text-cyan-600',
    bgLight: 'bg-cyan-50',
  },
  {
    type: 'file' as const,
    label: 'Digesto, Leyes y Normativas',
    sublabel: 'Documentos',
    icon: FileText,
    color: 'text-slate-600',
    bgLight: 'bg-slate-100',
  },
];

interface LinksSectionProps {
  links: QuickLink[];
  onSaveLink: (link: QuickLink) => void;
  onDeleteLink: (id: string) => void;
  isAdmin?: boolean;
}

export function LinksSection({
  links,
  onSaveLink,
  onDeleteLink,
  isAdmin = false,
}: LinksSectionProps) {
  const [selectedCat, setSelectedCat] = useState<string>('todos');
  const [isNewLinkModalOpen, setIsNewLinkModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<QuickLink | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newCategory, setNewCategory] = useState<'Google Workspace' | 'Diseño y Comunicación' | 'Gestión Legislativa' | 'Otros'>('Google Workspace');
  const [newDesc, setNewDesc] = useState('');
  const [newIconType, setNewIconType] = useState<'drive' | 'sheets' | 'forms' | 'gmail' | 'calendar' | 'canva' | 'globe' | 'file'>('drive');

  const handleCloseModal = () => {
    setIsNewLinkModalOpen(false);
    setEditingLink(null);
    setNewTitle('');
    setNewUrl('');
    setNewDesc('');
  };

  const newLinkSheet = useBottomSheetDrag({
    isOpen: isNewLinkModalOpen,
    onClose: handleCloseModal,
  });

  React.useEffect(() => {
    if (!isNewLinkModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isNewLinkModalOpen]);

  const handleOpenCreateModal = () => {
    if (!isAdmin) return;
    setEditingLink(null);
    setNewTitle('');
    setNewUrl('');
    setNewCategory('Google Workspace');
    setNewDesc('');
    setNewIconType('drive');
    setIsNewLinkModalOpen(true);
  };

  const handleOpenEditModal = (link: QuickLink) => {
    if (!isAdmin) return;
    setEditingLink(link);
    setNewTitle(link.title);
    setNewUrl(link.url);
    setNewCategory(link.category);
    setNewDesc(link.description || '');
    setNewIconType(link.iconType || 'drive');
    setIsNewLinkModalOpen(true);
  };

  const categories = ['todos', 'Google Workspace', 'Diseño y Comunicación', 'Gestión Legislativa', 'Otros'];

  const getLinkIcon = (type: string) => {
    switch (type) {
      case 'drive':
        return { icon: FolderOpen, color: 'text-amber-500' };
      case 'sheets':
        return { icon: FileSpreadsheet, color: 'text-emerald-600' };
      case 'forms':
        return { icon: FileCheck2, color: 'text-purple-600' };
      case 'calendar':
        return { icon: Calendar, color: 'text-[#0284c7]' };
      case 'gmail':
        return { icon: Mail, color: 'text-rose-500' };
      case 'canva':
        return { icon: Palette, color: 'text-indigo-500' };
      case 'file':
        return { icon: FileText, color: 'text-slate-600' };
      default:
        return { icon: Globe, color: 'text-slate-600' };
    }
  };

  const filteredLinks = links.filter((l) => {
    if (selectedCat === 'todos') return true;
    return l.category === selectedCat;
  });

  const handleSaveLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newUrl.trim()) return;

    let formattedUrl = newUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = 'https://' + formattedUrl;
    }

    const linkObj: QuickLink = {
      id: editingLink ? editingLink.id : 'link-' + Date.now(),
      title: newTitle.trim(),
      url: formattedUrl,
      category: newCategory,
      description: newDesc.trim(),
      iconType: newIconType,
      isExternal: true,
    };

    onSaveLink(linkObj);
    handleCloseModal();
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 p-6 sm:p-7 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#eff6ff] text-[#0284c7] text-[11px] font-bold border border-[#bfdbfe]">
            <Link2 className="w-3 h-3 text-[#0284c7]" />
            <span className="uppercase tracking-wider">ECOSISTEMA OPERATIVO • ENLACES Y PLATAFORMAS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#001428] tracking-tight">
            Enlaces Útiles y Accesos Directos
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Plataformas y herramientas de trabajo diario: Google Workspace, Canva, Digesto Jurídico, Boletín Oficial y sistemas parlamentarios.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#001428] hover:bg-[#122a45] text-white text-xs font-semibold rounded shadow-xs transition-colors cursor-pointer shrink-0"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Agregar Enlace</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCat(cat)}
              className={`px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer shrink-0 ${
                selectedCat === cat
                  ? 'bg-[#001428] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {cat === 'todos' ? 'Todos los Enlaces' : cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredLinks.map((item) => {
          const { icon: Icon, color } = getLinkIcon(item.iconType);

          return (
            <div
              key={item.id}
              className="bg-white rounded-lg border border-slate-200 hover:border-slate-300 p-4 shadow-xs flex flex-col justify-between transition-colors group"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between">
                  <div className="w-8 h-8 rounded bg-slate-50 border border-slate-200 flex items-center justify-center">
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                    {item.category}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-[#001428] group-hover:text-[#0284c7] transition-colors leading-tight">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0284c7] hover:underline"
                >
                  <span>Abrir enlace</span>
                  <ExternalLink className="w-3 h-3" />
                </a>

                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(item)}
                      title="Editar acceso directo"
                      aria-label={`Editar ${item.title}`}
                      className="p-1 text-slate-400 hover:text-[#0284c7] hover:bg-slate-100 rounded transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteLink(item.id)}
                      title="Eliminar acceso directo"
                      aria-label={`Eliminar ${item.title}`}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isNewLinkModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseModal();
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden sm:overflow-y-auto overscroll-none"
        >
          <div
            data-bottom-sheet="true"
            style={newLinkSheet.sheetStyle}
            className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain h-[88dvh] sm:h-auto sm:max-h-[90vh] flex flex-col animate-in fade-in sm:zoom-in-95 duration-200"
          >
            <BottomSheetHandle
              {...newLinkSheet.dragBind}
              isExpanded={newLinkSheet.isExpanded}
              isDragging={newLinkSheet.isDragging}
            />
            <div
              {...newLinkSheet.dragBind}
              className="p-4 sm:p-6 pb-3 sm:pb-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 select-none touch-none sm:touch-auto cursor-grab active:cursor-grabbing sm:cursor-default"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {editingLink ? (
                  <Edit2 className="w-5 h-5 text-[#0284c7] shrink-0" />
                ) : (
                  <Link2 className="w-5 h-5 text-[#001428] shrink-0" />
                )}
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-[#001428] tracking-tight truncate">
                    {editingLink ? 'Editar Acceso Directo' : 'Nuevo Acceso Directo'}
                  </h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                    {editingLink
                      ? `Modifica los datos del acceso: ${editingLink.title}`
                      : 'Herramientas digitales, portales y enlaces de interés'}
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

            <form onSubmit={handleSaveLinkSubmit} className="p-4 sm:p-6 space-y-3.5 overflow-y-auto flex-1 text-xs text-slate-800">
              <div>
                <label className="block text-xs font-bold text-[#001428] mb-1">Nombre de la Herramienta o Sitio *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ej. Digesto Jurídico Provincial"
                  className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#001428] mb-1">Enlace / URL *</label>
                <input
                  type="text"
                  required
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#001428] mb-1">Categoría</label>
                <select
                  value={newCategory}
                  onChange={(e: any) => setNewCategory(e.target.value)}
                  className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none bg-white font-medium"
                >
                  <option value="Google Workspace">Google Workspace</option>
                  <option value="Diseño y Comunicación">Diseño y Comunicación</option>
                  <option value="Gestión Legislativa">Gestión Legislativa</option>
                  <option value="Otros">Otros</option>
                </select>
              </div>

              {/* Selector Visual de Íconos Representativos */}
              <div className="space-y-1.5 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-[#001428]">
                    Seleccionar Ícono Representativo:
                  </label>
                  <span className="text-[11px] font-semibold text-[#0284c7] bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                    {LINK_ICON_OPTIONS.find((i) => i.type === newIconType)?.sublabel}
                  </span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-4 gap-2">
                  {LINK_ICON_OPTIONS.map((item) => {
                    const IconComp = item.icon;
                    const isSelected = newIconType === item.type;
                    return (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => setNewIconType(item.type)}
                        className={`p-2 sm:p-2.5 rounded-lg border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#001428] text-white border-[#001428] ring-2 ring-sky-400 shadow-xs'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                        title={item.label}
                      >
                        <div
                          className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-white/15 text-white'
                              : `${item.bgLight} ${item.color}`
                          }`}
                        >
                          <IconComp className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-bold truncate max-w-full">
                          {item.sublabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#001428] mb-1">Descripción Breve</label>
                <textarea
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Para qué sirve el acceso..."
                  className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-md font-semibold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#001428] hover:bg-[#122a45] text-white text-xs font-bold rounded-md shadow-xs transition-colors cursor-pointer"
                >
                  {editingLink ? 'Guardar Cambios' : 'Guardar Enlace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
