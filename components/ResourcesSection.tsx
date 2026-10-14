'use client';

import React, { useState, useRef, useMemo } from 'react';
import DOMPurify from 'dompurify';
import {
  FolderOpen,
  FileText,
  Copy,
  Check,
  ExternalLink,
  PlusCircle,
  FileCheck2,
  Presentation,
  Shield,
  Palette,
  Search,
  ArrowRight,
  X,
  GraduationCap,
  Upload,
  Download,
  Table,
  ClipboardList,
  Layers,
  Printer,
  Trash2,
  Eye,
  FileSpreadsheet,
  File,
  Sparkles,
} from 'lucide-react';
import mammoth from 'mammoth';
import { ResourceDocument } from '@/lib/mock-data';
import { useBottomSheetDrag } from '@/lib/useBottomSheetDrag';
import { BottomSheetHandle } from '@/components/BottomSheetHandle';
import { ConfirmationModal } from '@/components/ConfirmationModal';

interface ResourcesSectionProps {
  resources: ResourceDocument[];
  onSaveResource: (res: ResourceDocument) => void;
  onDeleteResource?: (id: string) => void;
  initialSearch?: string;
  isAdmin?: boolean;
}

interface DocxParseResult {
  fileName: string;
  fileSizeKb: number;
  htmlContent: string;
  rawText: string;
  wordCount: number;
  charCount: number;
}

export function ResourcesSection({
  resources,
  onSaveResource,
  onDeleteResource,
  initialSearch = '',
  isAdmin = false,
}: ResourcesSectionProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [selectedFormat, setSelectedFormat] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [prevInitialSearch, setPrevInitialSearch] = useState(initialSearch);

  // Active resource preview modal
  const [activeResource, setActiveResource] = useState<ResourceDocument | null>(null);

  // DOCX custom file reader state (Standalone viewer)
  const [isDocxUploadModalOpen, setIsDocxUploadModalOpen] = useState(false);
  const [docxResult, setDocxResult] = useState<DocxParseResult | null>(null);
  const [isParsingDocx, setIsParsingDocx] = useState(false);
  const [docxParseError, setDocxParseError] = useState<string | null>(null);
  const [docxViewMode, setDocxViewMode] = useState<'formatted' | 'raw'>('formatted');
  const headerFileInputRef = useRef<HTMLInputElement>(null);

  // Form-specific DOCX loader state (inside Nuevo Recurso modal)
  const formFileInputRef = useRef<HTMLInputElement>(null);
  const [isParsingFormDocx, setIsParsingFormDocx] = useState(false);
  const [formLoadedDocxInfo, setFormLoadedDocxInfo] = useState<{ fileName: string; words: number } | null>(null);
  const [formDocxError, setFormDocxError] = useState<string | null>(null);

  // Copy feedback states
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDocxCopied, setIsDocxCopied] = useState(false);

  // Resource creation modal state
  const [isNewResourceModalOpen, setIsNewResourceModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<ResourceDocument['category']>('nota_modelo');
  const [newFormat, setNewFormat] = useState<ResourceDocument['format']>('DOCX');
  const [newDesc, setNewDesc] = useState('');
  const [newTemplate, setNewTemplate] = useState('');
  const [newDriveUrl, setNewDriveUrl] = useState('');

  // Delete confirmation
  const [resourceToDelete, setResourceToDelete] = useState<ResourceDocument | null>(null);

  // Bottom sheets for mobile
  const templateSheet = useBottomSheetDrag({
    isOpen: Boolean(activeResource),
    onClose: () => setActiveResource(null),
  });
  const docxSheet = useBottomSheetDrag({
    isOpen: isDocxUploadModalOpen,
    onClose: () => setIsDocxUploadModalOpen(false),
  });
  const newResourceSheet = useBottomSheetDrag({
    isOpen: isNewResourceModalOpen,
    onClose: () => {
      setIsNewResourceModalOpen(false);
      setFormLoadedDocxInfo(null);
      setFormDocxError(null);
    },
  });

  React.useEffect(() => {
    if (!isNewResourceModalOpen && !activeResource && !isDocxUploadModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeResource) setActiveResource(null);
        if (isDocxUploadModalOpen) setIsDocxUploadModalOpen(false);
        if (isNewResourceModalOpen) {
          setIsNewResourceModalOpen(false);
          setFormLoadedDocxInfo(null);
          setFormDocxError(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isNewResourceModalOpen, activeResource, isDocxUploadModalOpen]);

  if (initialSearch !== prevInitialSearch) {
    setPrevInitialSearch(initialSearch);
    setSearchQuery(initialSearch);
  }

  const categories = [
    { id: 'todos', label: 'Todos los Tipos', icon: FolderOpen },
    { id: 'visita_escolar', label: 'Visitas Escolares', icon: GraduationCap },
    { id: 'nota_modelo', label: 'Modelos de Notas', icon: FileText },
    { id: 'formulario', label: 'Formularios y Planillas', icon: FileCheck2 },
    { id: 'protocolo', label: 'Protocolos y Normativa', icon: Shield },
    { id: 'material_institucional', label: 'Material Institucional', icon: Palette },
    { id: 'presentacion', label: 'Presentaciones', icon: Presentation },
  ];

  const formatOptions = [
    { id: 'todos', label: 'Todos los formatos' },
    { id: 'DOCX', label: 'DOCX (Word)' },
    { id: 'PDF', label: 'PDF (Reglamentos)' },
    { id: 'SHEET', label: 'Hojas de Cálculo' },
    { id: 'FORM', label: 'Formularios Web' },
    { id: 'SLIDES', label: 'Diapositivas' },
  ];

  const filteredResources = useMemo(() => {
    return resources.filter((res) => {
      if (selectedCategory !== 'todos' && res.category !== selectedCategory) return false;
      if (selectedFormat !== 'todos' && res.format !== selectedFormat) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          res.title.toLowerCase().includes(q) ||
          res.description.toLowerCase().includes(q) ||
          (res.contentTemplate && res.contentTemplate.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [resources, selectedCategory, selectedFormat, searchQuery]);

  // Handle Copy text to clipboard
  const handleCopyText = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Handle parse DOCX file from client device for the STANDALONE viewer
  const handleDocxFileSelected = async (file: File) => {
    if (!file) return;
    setIsParsingDocx(true);
    setDocxParseError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
      const textResult = await mammoth.extractRawText({ arrayBuffer });

      const rawText = textResult.value || '';
      // El HTML proviene de un .docx subido por el usuario: DOMPurify elimina scripts y
      // atributos/URIs peligrosos antes de guardarlo en el estado que se renderiza.
      const htmlContent =
        DOMPurify.sanitize(htmlResult.value || '') ||
        '<p><em>El archivo no contiene texto legible.</em></p>';

      const words = rawText.trim() ? rawText.trim().split(/\s+/).length : 0;
      const chars = rawText.length;
      const sizeKb = Math.round(file.size / 1024);

      setDocxResult({
        fileName: file.name,
        fileSizeKb: sizeKb,
        htmlContent,
        rawText,
        wordCount: words,
        charCount: chars,
      });

      // Ensure other modals are closed before opening the standalone viewer
      setIsNewResourceModalOpen(false);
      setActiveResource(null);
      setIsDocxUploadModalOpen(true);
    } catch (err: any) {
      console.error('Error parsing DOCX with mammoth:', err);
      setDocxParseError('No se pudo procesar el archivo Word. Asegúrate de que sea un archivo .docx válido y sin contraseñas.');
      setIsNewResourceModalOpen(false);
      setActiveResource(null);
      setIsDocxUploadModalOpen(true);
    } finally {
      setIsParsingDocx(false);
      if (headerFileInputRef.current) {
        headerFileInputRef.current.value = '';
      }
    }
  };

  // Handle parse DOCX file specifically INSIDE the "Nuevo Recurso" form
  // (Directly populates the template and title, NEVER opens a secondary viewer modal)
  const handleFormDocxSelected = async (file: File) => {
    if (!file) return;
    setIsParsingFormDocx(true);
    setFormDocxError(null);
    setIsDocxUploadModalOpen(false);
    setActiveResource(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const textResult = await mammoth.extractRawText({ arrayBuffer });
      const rawText = textResult.value || '';

      if (!rawText.trim()) {
        setFormDocxError('El archivo .docx no contiene texto legible o está vacío.');
        return;
      }

      const words = rawText.trim().split(/\s+/).length;

      // Directly fill the template textarea and format
      setNewTemplate(rawText);
      setNewFormat('DOCX');

      // If user hasn't typed a title yet, infer clean title from file name
      if (!newTitle.trim()) {
        const cleanTitle = file.name.replace(/\.docx$/i, '').replace(/[-_]/g, ' ').trim();
        if (cleanTitle) {
          setNewTitle(cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1));
        }
      }

      setFormLoadedDocxInfo({
        fileName: file.name,
        words,
      });
    } catch (err: any) {
      console.error('Error importing DOCX into form:', err);
      setFormDocxError('No se pudo leer el archivo .docx. Verifica que el archivo no esté dañado.');
    } finally {
      setIsParsingFormDocx(false);
      if (formFileInputRef.current) {
        formFileInputRef.current.value = '';
      }
    }
  };

  const handleCopyDocxResult = () => {
    if (!docxResult?.rawText) return;
    navigator.clipboard.writeText(docxResult.rawText);
    setIsDocxCopied(true);
    setTimeout(() => setIsDocxCopied(false), 2500);
  };

  const handleSaveDocxAsResource = () => {
    if (!docxResult) return;
    const title = docxResult.fileName.replace(/\.docx$/i, '').replace(/[-_]/g, ' ');
    const newDoc: ResourceDocument = {
      id: 'res-' + Date.now(),
      title: title.charAt(0).toUpperCase() + title.slice(1),
      category: 'nota_modelo',
      format: 'DOCX',
      description: `Documento importado desde archivo DOCX local (${docxResult.wordCount} palabras).`,
      updatedAt: 'Hoy',
      contentTemplate: docxResult.rawText,
    };
    onSaveResource(newDoc);
    setIsDocxUploadModalOpen(false);
    setActiveResource(newDoc);
  };

  const handleCreateResource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    // Esquema forzado: lo que no venga con http(s) recibe https:// (un `javascript:` o
    // cualquier esquema raro nunca llega a un href de navegador).
    const driveRaw = newDriveUrl.trim();
    const driveUrl = driveRaw
      ? /^https?:\/\//i.test(driveRaw)
        ? driveRaw
        : `https://${driveRaw}`
      : undefined;

    const newDoc: ResourceDocument = {
      id: 'res-' + Date.now(),
      title: newTitle.trim(),
      category: newCategory,
      format: newFormat,
      description: newDesc.trim() || 'Modelo oficial cargado por administración.',
      updatedAt: 'Hoy',
      driveUrl,
      contentTemplate: newTemplate.trim() || undefined,
    };

    onSaveResource(newDoc);
    handleCloseNewResourceModal();
  };

  const handleOpenNewResourceModal = () => {
    setActiveResource(null);
    setIsDocxUploadModalOpen(false);
    setFormLoadedDocxInfo(null);
    setFormDocxError(null);
    setIsNewResourceModalOpen(true);
  };

  const handleCloseNewResourceModal = () => {
    setIsNewResourceModalOpen(false);
    setNewTitle('');
    setNewDesc('');
    setNewTemplate('');
    setNewDriveUrl('');
    setFormLoadedDocxInfo(null);
    setFormDocxError(null);
  };

  const handleOpenResourcePreview = (res: ResourceDocument) => {
    setIsNewResourceModalOpen(false);
    setIsDocxUploadModalOpen(false);
    setActiveResource(res);
  };

  const confirmDeleteResource = () => {
    if (!resourceToDelete) return;
    if (onDeleteResource) {
      onDeleteResource(resourceToDelete.id);
    }
    setResourceToDelete(null);
    if (activeResource?.id === resourceToDelete.id) {
      setActiveResource(null);
    }
  };

  // Format Helper: Badge styling and icons
  const getFormatBadge = (format: ResourceDocument['format']) => {
    switch (format) {
      case 'DOCX':
        return {
          label: 'DOCX • Word',
          icon: FileText,
          bg: 'bg-blue-50 text-[#0284c7] border-blue-200',
        };
      case 'PDF':
        return {
          label: 'PDF • Oficial',
          icon: Shield,
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
        };
      case 'SHEET':
        return {
          label: 'Hoja de Cálculo',
          icon: FileSpreadsheet,
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        };
      case 'FORM':
        return {
          label: 'Formulario Web',
          icon: ClipboardList,
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
        };
      case 'SLIDES':
        return {
          label: 'Diapositivas',
          icon: Presentation,
          bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        };
      default:
        return {
          label: format,
          icon: File,
          bg: 'bg-slate-50 text-slate-700 border-slate-200',
        };
    }
  };

  // Helper to parse table markdown/text into structured rows for SHEET view
  const parsedSheetData = useMemo(() => {
    if (!activeResource?.contentTemplate || activeResource.format !== 'SHEET') return null;
    const lines = activeResource.contentTemplate.split('\n');
    const tableLines = lines.filter((l) => l.trim().startsWith('|') && l.trim().endsWith('|'));
    if (tableLines.length === 0) return null;

    const rows = tableLines.map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim())
    );

    const headers = rows[0] || [];
    const dataRows = rows.slice(1);
    return { headers, dataRows };
  }, [activeResource]);

  return (
    <div className="space-y-6">
      {/* Hidden file input for STANDALONE DOCX viewer from header */}
      <input
        type="file"
        ref={headerFileInputRef}
        accept=".docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleDocxFileSelected(file);
        }}
      />

      {/* Hidden file input for DOCX template insertion inside Nuevo Recurso modal */}
      <input
        type="file"
        ref={formFileInputRef}
        accept=".docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFormDocxSelected(file);
        }}
      />

      {/* Main Header Card */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 sm:p-7 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-2 max-w-3xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#eff6ff] text-[#0284c7] text-[11px] font-bold border border-[#bfdbfe]">
            <FolderOpen className="w-3 h-3 text-[#0284c7]" />
            <span className="uppercase tracking-wider">GESTIÓN DOCUMENTAL • EXPEDIENTES, MODELOS Y FORMATOS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#001428] tracking-tight">
            Recursos, Modelos y Documentación
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Biblioteca institucional de notas formales, reglamentos, protocolos de visitas, planillas de control y presentaciones oficiales. 
            Todos los formatos se pueden <strong>previsualizar, leer y copiar directamente</strong> sin depender de Google Drive. También puedes <strong>cargar tus propios archivos .docx</strong> para visualizarlos y extraer su texto.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* DOCX Upload / Reader Trigger Button */}
          <button
            type="button"
            onClick={() => {
              setIsNewResourceModalOpen(false);
              setActiveResource(null);
              headerFileInputRef.current?.click();
            }}
            disabled={isParsingDocx}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold rounded-lg shadow-2xs transition-colors cursor-pointer"
            title="Seleccionar un archivo .docx de tu computadora para previsualizarlo y copiar su texto"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{isParsingDocx ? 'Procesando Word...' : 'Cargar / Visor DOCX'}</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={handleOpenNewResourceModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#001428] hover:bg-[#122a45] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Nuevo Recurso</span>
            </button>
          )}

          {/* Optional Google Drive External Link */}
          <a
            href="https://drive.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-[#001428] text-xs font-medium rounded-lg border border-slate-200 transition-colors"
            title="Acceso externo a la nube de Google Drive (opcional)"
          >
            <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
            <span>Drive (Opcional)</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </a>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Categories */}
          <div className="flex flex-wrap items-center gap-1.5">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#001428] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search + Format selector */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              className="text-xs py-1.5 px-2.5 rounded-lg border border-slate-200 bg-slate-50/70 font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#0284c7] cursor-pointer"
            >
              {formatOptions.map((fmt) => (
                <option key={fmt.id} value={fmt.id}>
                  {fmt.label}
                </option>
              ))}
            </select>

            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por título, tema o texto..."
                className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0284c7] bg-slate-50/50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Resources Cards Grid */}
      {filteredResources.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center space-y-3">
          <FolderOpen className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-[#001428]">No se encontraron documentos</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            No hay recursos que coincidan con los filtros seleccionados o la búsqueda.
          </p>
          <button
            onClick={() => {
              setSelectedCategory('todos');
              setSelectedFormat('todos');
              setSearchQuery('');
            }}
            className="text-xs font-bold text-[#0284c7] hover:underline"
          >
            Restablecer filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredResources.map((res) => {
            const badge = getFormatBadge(res.format);
            const BadgeIcon = badge.icon;
            const hasContent = Boolean(res.contentTemplate);

            return (
              <div
                key={res.id}
                className="bg-white rounded-lg border border-slate-200 hover:border-slate-300 p-4 shadow-xs flex flex-col justify-between transition-colors space-y-3 relative group"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${badge.bg}`}
                    >
                      <BadgeIcon className="w-3 h-3" />
                      <span>{badge.label}</span>
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      Actualizado: {res.updatedAt}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-[#001428] leading-tight">
                    {res.title}
                  </h3>

                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                    {res.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenResourcePreview(res)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0284c7] hover:underline cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ver y Copiar</span>
                    </button>

                    {res.driveUrl && (
                      <a
                        href={res.driveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded"
                        title="Abrir enlace externo"
                        aria-label="Abrir enlace externo"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {hasContent && (
                      <button
                        type="button"
                        onClick={() => handleCopyText(res.contentTemplate!, res.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded border border-slate-200 transition-colors cursor-pointer"
                        title="Copiar todo el texto al portapapeles"
                      >
                        {copiedId === res.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700 text-[11px] font-bold">¡Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span className="text-[11px]">Copiar</span>
                          </>
                        )}
                      </button>
                    )}

                    {isAdmin && onDeleteResource && (
                      <button
                        type="button"
                        onClick={() => setResourceToDelete(res)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Eliminar recurso"
                        aria-label="Eliminar recurso"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: UNIVERSAL RESOURCE PREVIEW & TEXT COPY (DOCX, PDF, SHEET, FORM, SLIDES) */}
      {/* ========================================================================= */}
      {activeResource && !isDocxUploadModalOpen && !isNewResourceModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveResource(null);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden sm:overflow-y-auto overscroll-none"
        >
          <div
            data-bottom-sheet="true"
            style={templateSheet.sheetStyle}
            className="w-full sm:max-w-3xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain h-[90dvh] sm:h-auto sm:max-h-[92vh] flex flex-col animate-in fade-in sm:zoom-in-95 duration-200"
          >
            <BottomSheetHandle
              {...templateSheet.dragBind}
              isExpanded={templateSheet.isExpanded}
              isDragging={templateSheet.isDragging}
            />

            {/* Modal Header */}
            <div
              {...templateSheet.dragBind}
              className="p-4 sm:p-5 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 select-none touch-none sm:touch-auto cursor-grab active:cursor-grabbing sm:cursor-default"
            >
              <div className="flex items-center gap-3 min-w-0">
                {(() => {
                  const badge = getFormatBadge(activeResource.format);
                  const Icon = badge.icon;
                  return (
                    <div className={`p-2 rounded-lg border shrink-0 ${badge.bg}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                  );
                })()}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold uppercase text-[#0284c7]">
                      {activeResource.format} • {activeResource.category.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="text-[10px] text-slate-400">Actualizado: {activeResource.updatedAt}</span>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-[#001428] truncate">
                    {activeResource.title}
                  </h3>
                </div>
              </div>

              <button
                onClick={() => setActiveResource(null)}
                className="hidden sm:flex text-slate-400 hover:text-slate-800 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ml-2"
                title="Cerrar ventana"
                aria-label="Cerrar ventana"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Specialized view per format */}
            <div className="p-4 sm:p-6 overflow-y-auto overscroll-contain flex-1 space-y-4 text-xs text-slate-800">
              <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                {activeResource.description}
              </p>

              {/* SHEET (Planilla) interactive table view */}
              {activeResource.format === 'SHEET' && parsedSheetData ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                      <Table className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Estructura de la Planilla ({parsedSheetData.dataRows.length} registros cargados)</span>
                    </span>
                    <span className="text-[10px] text-slate-500">Compatible con Excel y Google Sheets</span>
                  </div>
                  <div className="border border-slate-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#001428] text-white">
                        <tr>
                          {parsedSheetData.headers.map((h, i) => (
                            <th key={i} className="p-2.5 font-bold border-b border-slate-700 whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedSheetData.dataRows.map((row, rIdx) => (
                          <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="p-2 text-slate-700 whitespace-nowrap">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {/* Standard text template for all formats */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    {activeResource.format === 'DOCX'
                      ? 'Texto del Modelo Oficial (Listo para Copiar y Usar)'
                      : activeResource.format === 'PDF'
                      ? 'Articulado y Texto Normativo del Protocolo'
                      : activeResource.format === 'FORM'
                      ? 'Cuestionario y Estructura del Formulario'
                      : activeResource.format === 'SLIDES'
                      ? 'Estructura y Guión de Diapositivas'
                      : 'Contenido del Documento'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {activeResource.contentTemplate?.length || 0} caracteres
                  </span>
                </div>

                <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/80 font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed select-text shadow-2xs max-h-[46vh] overflow-y-auto">
                  {activeResource.contentTemplate || (
                    <em className="text-slate-400">No se ha cargado una plantilla de texto para este recurso.</em>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer with Actions */}
            <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 text-xs text-slate-500 w-full sm:w-auto">
                {activeResource.driveUrl && (
                  <a
                    href={activeResource.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#0284c7] hover:underline font-semibold"
                  >
                    <span>Abrir enlace externo</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setActiveResource(null)}
                  className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-200 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  Cerrar
                </button>

                {activeResource.contentTemplate && (
                  <button
                    type="button"
                    onClick={() => handleCopyText(activeResource.contentTemplate!, activeResource.id)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#001428] hover:bg-[#0e4a7b] text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer w-full sm:w-auto"
                  >
                    {copiedId === activeResource.id ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>¡Texto Copiado al Portapapeles!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copiar todo el texto</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: DOCX VISUALIZER & PARSER (MAMMOTH.JS INTEGRATION) */}
      {/* ========================================================================= */}
      {isDocxUploadModalOpen && !isNewResourceModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsDocxUploadModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden sm:overflow-y-auto overscroll-none"
        >
          <div
            data-bottom-sheet="true"
            style={docxSheet.sheetStyle}
            className="w-full sm:max-w-3xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain h-[90dvh] sm:h-auto sm:max-h-[92vh] flex flex-col animate-in fade-in sm:zoom-in-95 duration-200"
          >
            <BottomSheetHandle
              {...docxSheet.dragBind}
              isExpanded={docxSheet.isExpanded}
              isDragging={docxSheet.isDragging}
            />

            {/* Header */}
            <div
              {...docxSheet.dragBind}
              className="p-4 sm:p-5 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 select-none touch-none sm:touch-auto cursor-grab active:cursor-grabbing sm:cursor-default"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-[#0284c7] shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold uppercase text-[#0284c7]">
                      VISOR & EXTRACTOR DE ARCHIVOS WORD (.DOCX)
                    </span>
                    {docxResult && (
                      <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-bold">
                        {docxResult.fileSizeKb} KB
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-[#001428] truncate">
                    {docxResult?.fileName || 'Visor de Documentos Word'}
                  </h3>
                </div>
              </div>

              <button
                onClick={() => setIsDocxUploadModalOpen(false)}
                className="hidden sm:flex text-slate-400 hover:text-slate-800 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ml-2"
                title="Cerrar ventana"
                aria-label="Cerrar ventana"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-6 overflow-y-auto overscroll-contain flex-1 space-y-4 text-xs text-slate-800">
              {docxParseError ? (
                <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg space-y-2">
                  <p className="font-bold">Error al procesar el archivo Word</p>
                  <p className="text-xs">{docxParseError}</p>
                  <button
                    onClick={() => headerFileInputRef.current?.click()}
                    className="text-xs font-bold text-rose-700 underline"
                  >
                    Intentar con otro archivo
                  </button>
                </div>
              ) : docxResult ? (
                <>
                  {/* Document Stats & Mode Switcher */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="flex items-center gap-4 text-xs text-slate-600">
                      <div>
                        <strong>{docxResult.wordCount}</strong> palabras
                      </div>
                      <div>
                        <strong>{docxResult.charCount}</strong> caracteres
                      </div>
                      <div className="hidden sm:block text-slate-400">• Motor Mammoth.js</div>
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setDocxViewMode('formatted')}
                        className={`px-2.5 py-1 text-xs font-bold rounded transition-colors cursor-pointer ${
                          docxViewMode === 'formatted'
                            ? 'bg-[#001428] text-white shadow-2xs'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        Vista Formato
                      </button>
                      <button
                        type="button"
                        onClick={() => setDocxViewMode('raw')}
                        className={`px-2.5 py-1 text-xs font-bold rounded transition-colors cursor-pointer ${
                          docxViewMode === 'raw'
                            ? 'bg-[#001428] text-white shadow-2xs'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        Texto Plano
                      </button>
                    </div>
                  </div>

                  {/* Rendered Content */}
                  {docxViewMode === 'formatted' ? (
                    <div
                      className="p-6 bg-white border border-slate-200 rounded-lg shadow-inner prose prose-slate max-w-none text-xs sm:text-sm leading-relaxed max-h-[50vh] overflow-y-auto select-text font-serif"
                      dangerouslySetInnerHTML={{
                        // htmlContent ya fue sanitizado con DOMPurify al parsear el .docx.
                        __html: docxResult.htmlContent,
                      }}
                    />
                  ) : (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed max-h-[50vh] overflow-y-auto select-text">
                      {docxResult.rawText}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-10 space-y-3">
                  <Upload className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-sm font-semibold text-slate-700">Selecciona un archivo .docx para visualizar</p>
                  <button
                    onClick={() => headerFileInputRef.current?.click()}
                    className="px-4 py-2 bg-[#0284c7] text-white text-xs font-bold rounded-lg"
                  >
                    Examinar archivos
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => headerFileInputRef.current?.click()}
                  className="px-3 py-2 text-xs text-[#0284c7] hover:bg-blue-50 border border-blue-200 rounded-lg font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Cargar otro DOCX</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setIsDocxUploadModalOpen(false)}
                  className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-200 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  Cerrar
                </button>

                {isAdmin && docxResult && (
                  <button
                    type="button"
                    onClick={handleSaveDocxAsResource}
                    className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-[#001428] text-xs font-bold rounded-lg transition-colors cursor-pointer"
                    title="Añadir este documento a la biblioteca de recursos del Instituto"
                  >
                    Guardar en Recursos
                  </button>
                )}

                {docxResult?.rawText && (
                  <button
                    type="button"
                    onClick={handleCopyDocxResult}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#001428] hover:bg-[#0e4a7b] text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer w-full sm:w-auto"
                  >
                    {isDocxCopied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>¡Texto Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copiar todo el texto</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CREATE NEW RESOURCE OR TEMPLATE */}
      {/* ========================================================================= */}
      {isNewResourceModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseNewResourceModal();
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden sm:overflow-y-auto overscroll-none"
        >
          <div
            data-bottom-sheet="true"
            style={newResourceSheet.sheetStyle}
            className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain h-[90dvh] sm:h-auto sm:max-h-[92vh] flex flex-col animate-in fade-in sm:zoom-in-95 duration-200"
          >
            <BottomSheetHandle
              {...newResourceSheet.dragBind}
              isExpanded={newResourceSheet.isExpanded}
              isDragging={newResourceSheet.isDragging}
            />

            <div
              {...newResourceSheet.dragBind}
              className="p-4 sm:p-6 pb-3 sm:pb-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 select-none touch-none sm:touch-auto cursor-grab active:cursor-grabbing sm:cursor-default"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FolderOpen className="w-5 h-5 text-[#001428] shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-[#001428] tracking-tight truncate">
                    Nuevo Recurso o Modelo Oficial
                  </h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                    Modelos de notas, planillas, normativas y presentaciones
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseNewResourceModal}
                className="hidden sm:flex text-slate-400 hover:text-slate-800 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ml-2"
                title="Cerrar ventana"
                aria-label="Cerrar ventana"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateResource} className="p-4 sm:p-6 space-y-3.5 overflow-y-auto flex-1 text-xs text-slate-800">
              <div>
                <label className="block text-xs font-bold text-[#001428] mb-1">Título del Recurso *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ej. Modelo Nota Solicitud Visita Escolar"
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#001428] mb-1">Categoría</label>
                  <select
                    value={newCategory}
                    onChange={(e: any) => setNewCategory(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none bg-white font-medium cursor-pointer"
                  >
                    <option value="visita_escolar">Visitas Escolares</option>
                    <option value="nota_modelo">Modelos de Notas</option>
                    <option value="formulario">Formularios y Planillas</option>
                    <option value="protocolo">Protocolos y Normativa</option>
                    <option value="material_institucional">Material Institucional</option>
                    <option value="presentacion">Presentaciones</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#001428] mb-1">Formato</label>
                  <select
                    value={newFormat}
                    onChange={(e: any) => setNewFormat(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none bg-white font-medium cursor-pointer"
                  >
                    <option value="DOCX">DOCX (Word)</option>
                    <option value="PDF">PDF (Documento Oficial)</option>
                    <option value="SHEET">Google Sheets / Planilla</option>
                    <option value="FORM">Google Forms / Encuesta</option>
                    <option value="SLIDES">Google Slides / Diapositivas</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#001428] mb-1">Descripción Breve</label>
                <textarea
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Para qué sirve y cuándo utilizarlo..."
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-[#001428]">
                    Texto / Contenido de la Plantilla (para visualizar y copiar)
                  </label>
                  <button
                    type="button"
                    onClick={() => formFileInputRef.current?.click()}
                    disabled={isParsingFormDocx}
                    className="text-[11px] font-bold text-[#0284c7] hover:underline inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <Upload className="w-3 h-3" />
                    <span>{isParsingFormDocx ? 'Leyendo .docx...' : 'Cargar desde .docx'}</span>
                  </button>
                </div>

                {formLoadedDocxInfo && (
                  <div className="mb-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[11px] flex items-center justify-between animate-in fade-in">
                    <div className="flex items-center gap-1.5 truncate">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">
                        <strong>{formLoadedDocxInfo.fileName}</strong>: {formLoadedDocxInfo.words} palabras insertadas con éxito.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFormLoadedDocxInfo(null);
                        setNewTemplate('');
                      }}
                      className="text-emerald-700 hover:text-emerald-900 font-bold ml-2 text-[10px] underline shrink-0 cursor-pointer"
                    >
                      Limpiar
                    </button>
                  </div>
                )}

                {formDocxError && (
                  <div className="mb-2 p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-[11px] flex items-center gap-1.5 animate-in fade-in">
                    <X className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>{formDocxError}</span>
                  </div>
                )}

                <textarea
                  rows={6}
                  value={newTemplate}
                  onChange={(e) => setNewTemplate(e.target.value)}
                  placeholder="Copia o redacta el cuerpo oficial de la nota, reglamento o planilla..."
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#001428] mb-1">
                  Enlace Externo / Drive (Opcional)
                </label>
                <input
                  type="url"
                  value={newDriveUrl}
                  onChange={(e) => setNewDriveUrl(e.target.value)}
                  placeholder="https://drive.google.com/... o https://docs.google.com/..."
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#0284c7] focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseNewResourceModal}
                  className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#001428] hover:bg-[#0e4a7b] text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Guardar Recurso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={Boolean(resourceToDelete)}
        title="Eliminar recurso oficial"
        description={`¿Estás seguro de que deseas eliminar "${resourceToDelete?.title}" del repositorio institucional? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        isDestructive={true}
        onConfirm={confirmDeleteResource}
        onCancel={() => setResourceToDelete(null)}
      />
    </div>
  );
}
