import jsPDF from 'jspdf';
import { ActivityItem } from '@/lib/mock-data';
import { getInstitutionalSettings } from '@/lib/storage';
import { INSTITUTIONAL_TIMEZONE } from '@/lib/utils';

/**
 * Generación y descarga de documentos PDF institucionales.
 *
 * Los textos que identifican a la institución se toman de la Configuración Institucional
 * (editable por el Administrador). El nombre de la Legislatura todavía no es configurable,
 * por eso vive en una única constante.
 */
const LEGISLATURE_NAME = 'Honorable Legislatura de Tucumán';

type RGB = readonly [number, number, number];

// Paleta de colores institucionales en RGB
const COLOR_PRIMARY: RGB = [0, 20, 40];      // #001428 (Azul legislativo oscuro)
const COLOR_ACCENT: RGB = [2, 132, 199];     // #0284c7 (Azul cielo institucional)
const COLOR_TEXT: RGB = [30, 41, 59];        // #1e293b (Slate oscuro)
const COLOR_MUTED: RGB = [100, 116, 139];    // #64748b (Slate medio)
const COLOR_BORDER: RGB = [226, 232, 240];   // #e2e8f0 (Borde suave)
const COLOR_BG_LIGHT: RGB = [248, 250, 252]; // #f8fafc (Fondo suave)
const COLOR_WHITE: RGB = [255, 255, 255];
const COLOR_INDIGO: RGB = [99, 102, 241];

const fill = (doc: jsPDF, c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
const stroke = (doc: jsPDF, c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
const ink = (doc: jsPDF, c: RGB) => doc.setTextColor(c[0], c[1], c[2]);

const MARGIN = 15;
const FOOTER_RESERVED_MM = 20;

/**
 * Las fuentes estándar de jsPDF (Helvetica) solo cubren WinAnsi (Latin-1 + algunos signos).
 * Un emoji o un carácter fuera de ese conjunto se dibuja como basura, así que se reemplaza
 * por "?" y se descartan los caracteres de control (excepto salto de línea).
 */
function pdfText(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[^\n -~ -ÿ‘’“”–—•…€]/g, '?');
}

/** Nombre de archivo seguro (sin espacios ni caracteres que rompan la descarga). */
function safeFileName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** "2026-10-12" → "12/10/2026". Si el valor no tiene ese formato, se devuelve tal cual. */
function formatDateSlash(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd || 'sin fecha';
}

const STATUS_LABELS: Record<string, string> = {
  confirmada: 'CONFIRMADA',
  en_curso: 'EN CURSO',
  pendiente: 'PENDIENTE',
  finalizada: 'FINALIZADA',
  cancelada: 'CANCELADA',
};

const TYPE_LABELS: Record<string, string> = {
  visita: 'VISITA',
  capacitacion: 'CAPACITACIÓN',
  evento: 'EVENTO',
  reunion: 'REUNIÓN',
};

/** Etiqueta legible del estado. Si no hay estado NO se asume "confirmada": se informa que falta. */
function statusLabel(status?: string): string {
  if (!status) return 'SIN ESTADO';
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ').toUpperCase();
}

function typeLabel(type?: string): string {
  if (!type) return 'SIN TIPO';
  return TYPE_LABELS[type] ?? type.toUpperCase();
}

/** Cantidad de asistentes tal como fue cargada; nunca se inventa un valor por defecto. */
function attendeesText(count: number | undefined, singular: string, plural: string): string {
  return count && count > 0
    ? `${count.toLocaleString('es-AR')} ${count === 1 ? singular : plural}`
    : 'A confirmar';
}

/** Recorta un texto con "..." para que entre en `maxWidth` mm con la fuente actual del documento. */
function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && doc.getTextWidth(`${out}...`) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out.trimEnd()}...`;
}

function pageDims(doc: jsPDF) {
  return { width: doc.internal.pageSize.getWidth(), height: doc.internal.pageSize.getHeight() };
}

/** Fecha y hora de emisión en la zona horaria institucional (no la del navegador). */
function emissionStamp(): string {
  const now = new Date();
  const fecha = now.toLocaleDateString('es-AR', { timeZone: INSTITUTIONAL_TIMEZONE });
  const hora = now.toLocaleTimeString('es-AR', {
    timeZone: INSTITUTIONAL_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return `Emisión: ${fecha} ${hora}`;
}

/**
 * Dibuja el membrete oficial del Poder Legislativo
 */
function drawOfficialHeader(doc: jsPDF, title: string, subtitle?: string): number {
  const { width: pageWidth } = pageDims(doc);
  const instSettings = getInstitutionalSettings();

  // Banda superior institucional
  fill(doc, COLOR_PRIMARY);
  doc.rect(0, 0, pageWidth, 6, 'F');

  // Línea de acento celeste
  fill(doc, COLOR_ACCENT);
  doc.rect(0, 6, pageWidth, 1.5, 'F');

  let y = 16;

  // Cabecera institucional
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  ink(doc, COLOR_PRIMARY);
  doc.text(pdfText(instSettings.institutionSubtitle || 'PODER LEGISLATIVO').toUpperCase(), MARGIN, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  ink(doc, COLOR_MUTED);
  doc.text(pdfText(instSettings.instituteName || 'INSTITUTO DE CAPACITACIÓN').toUpperCase(), MARGIN, y + 4.5);
  doc.text(emissionStamp(), pageWidth - MARGIN, y + 4.5, { align: 'right' });

  y += 10;
  stroke(doc, COLOR_BORDER);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);

  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  ink(doc, COLOR_PRIMARY);
  const titleLines: string[] = doc.splitTextToSize(pdfText(title).toUpperCase(), pageWidth - 2 * MARGIN);
  doc.text(titleLines, MARGIN, y);
  y += (titleLines.length - 1) * 6;

  if (subtitle) {
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    ink(doc, COLOR_MUTED);
    doc.text(fitText(doc, pdfText(subtitle), pageWidth - 2 * MARGIN), MARGIN, y);
  }

  y += 6;
  return y;
}

/**
 * Dibuja el pie de página oficial con paginación
 */
function drawOfficialFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const { width: pageWidth, height: pageHeight } = pageDims(doc);
  const instSettings = getInstitutionalSettings();
  const footerText = pdfText(
    `${instSettings.instituteName} - ${instSettings.institutionSubtitle} • Sistema Oficial`
  );

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    stroke(doc, COLOR_BORDER);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, pageHeight - 14, pageWidth - MARGIN, pageHeight - 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    ink(doc, COLOR_MUTED);
    doc.text(fitText(doc, footerText, pageWidth - 2 * MARGIN - 30), MARGIN, pageHeight - 9);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - MARGIN, pageHeight - 9, { align: 'right' });
  }
}

/**
 * 1. Descarga del Cronograma Mensual Oficial en PDF
 */
export function downloadMonthlySchedulePdf(params: {
  monthName: string;
  year: number;
  activities: ActivityItem[];
}) {
  const { monthName, year, activities } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { width: pageWidth, height: pageHeight } = pageDims(doc);

  let currentY = drawOfficialHeader(
    doc,
    `Cronograma Oficial de Actividades y Visitas`,
    `Período: ${monthName} ${year} • Registro del Sistema Institucional`
  );

  // Resumen de Métricas del Período (solo con datos cargados: no se estiman asistentes faltantes)
  const totalActividades = activities.length;
  const totalVisitas = activities.filter((a) => a.type === 'visita').length;
  const totalCapacitaciones = activities.filter((a) => a.type === 'capacitacion').length;
  const totalAsistentes = activities.reduce((sum, a) => sum + (a.attendeesCount || 0), 0);

  fill(doc, COLOR_BG_LIGHT);
  doc.roundedRect(MARGIN, currentY, pageWidth - 2 * MARGIN, 16, 2, 2, 'F');
  stroke(doc, COLOR_BORDER);
  doc.roundedRect(MARGIN, currentY, pageWidth - 2 * MARGIN, 16, 2, 2, 'S');

  const colWidth = (pageWidth - 2 * MARGIN) / 4;
  const stats = [
    { label: 'TOTAL ACTIVIDADES', val: String(totalActividades) },
    { label: 'VISITAS ESCOLARES', val: String(totalVisitas) },
    { label: 'CAPACITACIONES', val: String(totalCapacitaciones) },
    { label: 'PERSONAS ASISTENTES', val: totalAsistentes.toLocaleString('es-AR') },
  ];

  stats.forEach((s, idx) => {
    const startX = MARGIN + colWidth * idx;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    ink(doc, COLOR_MUTED);
    doc.text(s.label, startX + 5, currentY + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    ink(doc, COLOR_PRIMARY);
    doc.text(s.val, startX + 5, currentY + 12);
  });

  currentY += 22;

  // Listado cronológico de actividades
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  ink(doc, COLOR_PRIMARY);
  doc.text('DETALLE CRONOLÓGICO DE LA JORNADA', MARGIN, currentY);
  currentY += 4;

  const sortedActivities = [...activities].sort((a, b) => {
    const cmp = (a.date || '').localeCompare(b.date || '');
    if (cmp !== 0) return cmp;
    return (a.startTime || '').localeCompare(b.startTime || '');
  });

  if (sortedActivities.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    ink(doc, COLOR_MUTED);
    doc.text('No hay actividades registradas en este período.', MARGIN, currentY + 8);
  } else {
    sortedActivities.forEach((act) => {
      const boxHeight = 17;
      // Verificar si cabe en la página actual
      if (currentY + boxHeight > pageHeight - FOOTER_RESERVED_MM) {
        doc.addPage();
        currentY = drawOfficialHeader(
          doc,
          `Cronograma Oficial de Actividades (Continuación)`,
          `Período: ${monthName} ${year}`
        );
      }

      // Caja de la actividad
      fill(doc, COLOR_WHITE);
      stroke(doc, COLOR_BORDER);
      doc.roundedRect(MARGIN, currentY, pageWidth - 2 * MARGIN, boxHeight, 1.5, 1.5, 'FD');

      // Franja lateral con color de tipo
      if (act.type === 'visita') {
        fill(doc, COLOR_ACCENT);
      } else if (act.type === 'capacitacion') {
        fill(doc, COLOR_INDIGO);
      } else {
        fill(doc, COLOR_PRIMARY);
      }
      doc.rect(MARGIN, currentY, 2.5, boxHeight, 'F');

      // Fecha y hora
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      ink(doc, COLOR_PRIMARY);
      doc.text(
        `${formatDateSlash(act.date)} • ${act.startTime || '--:--'} a ${act.endTime || '--:--'} hs`,
        21,
        currentY + 5
      );

      // Estado
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text(`[${statusLabel(act.status)}]`, pageWidth - 20, currentY + 5, { align: 'right' });

      // Título (recortado por ancho real, sin pisar la etiqueta de estado)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      ink(doc, COLOR_TEXT);
      doc.text(fitText(doc, pdfText(act.title), pageWidth - 21 - 20), 21, currentY + 10);

      // Ubicación y asistentes
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      ink(doc, COLOR_MUTED);
      const meta =
        `${pdfText(act.location)}  |  ` +
        `${attendeesText(act.attendeesCount, 'asistente estimado', 'asistentes estimados')}  |  ` +
        `Tipo: ${typeLabel(act.type)}`;
      doc.text(fitText(doc, meta, pageWidth - 21 - 20), 21, currentY + 14.5);

      currentY += boxHeight + 3;
    });
  }

  drawOfficialFooter(doc);
  doc.save(`cronograma-oficial-${safeFileName(monthName)}-${year}.pdf`);
}

/**
 * 2. Descarga de Ficha Técnica Individual de Actividad / Visita Guiada
 */
export function downloadActivitySheetPdf(activity: ActivityItem) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { width: pageWidth, height: pageHeight } = pageDims(doc);
  const instSettings = getInstitutionalSettings();
  const contentWidth = pageWidth - 2 * MARGIN;
  const limitY = pageHeight - FOOTER_RESERVED_MM;

  const continuation = () => {
    doc.addPage();
    return drawOfficialHeader(
      doc,
      'Ficha Técnica y Protocolar de Actividad (Continuación)',
      `ID: ${activity.id}`
    );
  };

  let y = drawOfficialHeader(
    doc,
    'Ficha Técnica y Protocolar de Actividad',
    `Acta Oficial de Coordinación y Reserva de Salones • ID: ${activity.id}`
  );

  // Cuadro principal de la actividad (el título puede ocupar varias líneas)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const titleLines: string[] = doc.splitTextToSize(pdfText(activity.title), contentWidth - 10).slice(0, 3);
  const mainBoxHeight = 8 + titleLines.length * 5 + 9;

  fill(doc, COLOR_BG_LIGHT);
  stroke(doc, COLOR_BORDER);
  doc.roundedRect(MARGIN, y, contentWidth, mainBoxHeight, 2, 2, 'FD');

  ink(doc, COLOR_PRIMARY);
  doc.text(titleLines, 20, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  ink(doc, COLOR_MUTED);
  doc.text(
    `TIPO DE GESTIÓN: ${typeLabel(activity.type)}  •  ESTADO: ${statusLabel(activity.status)}`,
    20,
    y + 8 + titleLines.length * 5 + 1
  );

  y += mainBoxHeight + 6;

  // Parámetros y Datos Técnicos
  const datos = [
    { label: 'Fecha Programada', val: `${formatDateSlash(activity.date)} (${activity.startTime || '--:--'} a ${activity.endTime || '--:--'} hs)` },
    { label: 'Lugar / Salón Asignado', val: activity.location || 'A confirmar' },
    { label: 'Contingente / Asistentes', val: attendeesText(activity.attendeesCount, 'persona', 'personas') },
    { label: 'Responsable de la Gestión', val: activity.responsible || 'Equipo Técnico del Instituto' },
    { label: 'Institución / Sector', val: activity.institution || LEGISLATURE_NAME },
    { label: 'Nivel / Modalidad', val: activity.level || 'Personal Legislativo / Institucional' },
    { label: 'Estado de la Reserva', val: statusLabel(activity.status) },
    ...(activity.contactEmail ? [{ label: 'Email de Contacto', val: activity.contactEmail }] : []),
    ...(activity.contactPhone ? [{ label: 'Teléfono de Contacto', val: activity.contactPhone }] : []),
  ];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  ink(doc, COLOR_PRIMARY);
  doc.text('DATOS DE LA RESERVA Y LOGÍSTICA', MARGIN, y);
  y += 4;

  const valueX = 75;
  const valueWidth = pageWidth - MARGIN - 5 - valueX;
  datos.forEach((item, idx) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const valueLines: string[] = doc.splitTextToSize(pdfText(item.val), valueWidth);
    const rowHeight = Math.max(8, valueLines.length * 3.8 + 4);

    if (y + rowHeight > limitY) y = continuation();

    if (idx % 2 === 0) fill(doc, COLOR_WHITE);
    else fill(doc, COLOR_BG_LIGHT);
    doc.rect(MARGIN, y, contentWidth, rowHeight, 'F');
    stroke(doc, COLOR_BORDER);
    doc.line(MARGIN, y + rowHeight, pageWidth - MARGIN, y + rowHeight);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    ink(doc, COLOR_TEXT);
    doc.text(item.label, 20, y + 5.5);

    doc.setFont('helvetica', 'normal');
    ink(doc, COLOR_MUTED);
    doc.text(valueLines, valueX, y + 5.5);

    y += rowHeight;
  });

  y += 6;

  // Descripción / Requerimientos (con salto de página si es extensa)
  if (activity.description) {
    if (y + 20 > limitY) y = continuation();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    ink(doc, COLOR_PRIMARY);
    doc.text('REQUERIMIENTOS Y OBSERVACIONES PROTOCOLARES', MARGIN, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const lines: string[] = doc.splitTextToSize(pdfText(activity.description), contentWidth - 10);
    const lineHeight = 3.7;
    let idx = 0;
    while (idx < lines.length) {
      const fitCount = Math.max(1, Math.floor((limitY - y - 8) / lineHeight));
      const chunk = lines.slice(idx, idx + fitCount);
      const boxH = chunk.length * lineHeight + 8;

      fill(doc, COLOR_BG_LIGHT);
      stroke(doc, COLOR_BORDER);
      doc.roundedRect(MARGIN, y, contentWidth, boxH, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      ink(doc, COLOR_TEXT);
      doc.text(chunk, 20, y + 6);

      y += boxH + 4;
      idx += chunk.length;
      if (idx < lines.length) y = continuation();
    }
  }

  // Firmas Institucionales (requieren ~25 mm; si no entran, van en una página nueva)
  if (y + 30 > limitY) y = continuation();
  y += 15;
  const colFirma = (pageWidth - 40) / 2;
  const firmaWidth = colFirma - 10;

  // Firma 1
  stroke(doc, COLOR_MUTED);
  doc.line(20, y, 20 + firmaWidth, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  ink(doc, COLOR_PRIMARY);
  doc.text('FIRMA RESPONSABLE DE LA ACTIVIDAD', 20 + firmaWidth / 2, y + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text('DNI / Acreditación Oficial', 20 + firmaWidth / 2, y + 8, { align: 'center' });

  // Firma 2 (nombre del Instituto desde la Configuración Institucional)
  const startFirma2 = 20 + colFirma + 10;
  stroke(doc, COLOR_MUTED);
  doc.line(startFirma2, y, startFirma2 + firmaWidth, y);
  doc.setFont('helvetica', 'bold');
  doc.text(
    fitText(doc, pdfText(instSettings.instituteName).toUpperCase(), firmaWidth),
    startFirma2 + firmaWidth / 2,
    y + 4,
    { align: 'center' }
  );
  doc.setFont('helvetica', 'normal');
  doc.text(LEGISLATURE_NAME, startFirma2 + firmaWidth / 2, y + 8, { align: 'center' });

  drawOfficialFooter(doc);
  doc.save(`ficha-actividad-${safeFileName(`${activity.date}-${activity.id}`)}.pdf`);
}

/**
 * 3. Descarga del Protocolo Oficial de Ingreso de Menores en PDF
 */
export function downloadProtocoloMenoresPdf() {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { width: pageWidth, height: pageHeight } = pageDims(doc);
  const limitY = pageHeight - FOOTER_RESERVED_MM;

  let y = drawOfficialHeader(
    doc,
    'Protocolo de Ingreso de Menores y Visitas Escolares',
    'Normativa de Seguridad, Convivencia y Acceso al Palacio Legislativo'
  );

  const articulos = [
    {
      num: 'ARTÍCULO 1° • ACREDITACIÓN Y RECEPCIÓN',
      text: 'Todo contingente escolar debe presentarse en el acceso principal con 15 minutos de anticipación al horario asignado. El docente a cargo presentará la nómina de alumnos con DNI y la constancia de cobertura de seguro escolar vigente emitida por la institución educativa.',
    },
    {
      num: 'ARTÍCULO 2° • ACOMPAÑAMIENTO Y RATIO DOCENTE',
      text: 'Se establece un ratio obligatorio mínimo de un (1) docente o adulto responsable por cada quince (15) estudiantes. Los tutores y docentes acompañantes son garantes de la disciplina y permanencia del grupo en todo momento del recorrido guiado.',
    },
    {
      num: 'ARTÍCULO 3° • SECTORES HABILITADOS Y RECORRIDO OFICIAL',
      text: 'El acceso al Recinto principal y sectores protocolares se realizará únicamente en compañía de los guías oficiales del Instituto. Queda estrictamente vedado el ingreso a oficinas privadas, áreas de archivo reservado o zonas de mantenimiento.',
    },
    {
      num: 'ARTÍCULO 4° • CUIDADO DEL PATRIMONIO HISTÓRICO Y EDILICIO',
      text: 'Los visitantes deberán preservar las bancas, estrado, cuadros y mobiliario histórico de la Cámara. No se permite el ingreso con alimentos o bebidas al recinto ni el uso de elementos punzantes o tintas.',
    },
    {
      num: 'ARTÍCULO 5° • PROTOCOLO DE EMERGENCIAS Y EVACUACIÓN',
      text: 'En caso de alerta o evacuación, el grupo seguirá las indicaciones del personal de Seguridad y Bomberos de la Legislatura hacia los puntos de encuentro seguros ubicados en las explanadas exteriores del edificio.',
    },
  ];

  articulos.forEach((art) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    const lines: string[] = doc.splitTextToSize(pdfText(art.text), pageWidth - 38);
    const boxHeight = 12 + lines.length * 3.4;

    if (y + boxHeight > limitY) {
      doc.addPage();
      y = drawOfficialHeader(doc, 'Protocolo de Ingreso de Menores (Continuación)');
    }

    fill(doc, COLOR_BG_LIGHT);
    stroke(doc, COLOR_BORDER);
    doc.roundedRect(MARGIN, y, pageWidth - 2 * MARGIN, boxHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    ink(doc, COLOR_ACCENT);
    doc.text(art.num, 19, y + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    ink(doc, COLOR_TEXT);
    doc.text(lines, 19, y + 10.5);

    y += boxHeight + 3;
  });

  drawOfficialFooter(doc);
  doc.save('protocolo-ingreso-menores-legislatura.pdf');
}

/**
 * 4. Descarga de Planilla Modelo de Autorización de Imagen y Grabación
 */
export function downloadAutorizacionImagenPdf() {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { width: pageWidth } = pageDims(doc);
  const instSettings = getInstitutionalSettings();

  let y = drawOfficialHeader(
    doc,
    'Autorización de Imagen y Registro Audiovisual',
    'Planilla Modelo para Visitas Cívicas y Escolares • Poder Legislativo'
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  ink(doc, COLOR_TEXT);

  const textoLegal = pdfText(
    `Por la presente, en mi carácter de padre, madre o tutor legal del estudiante identificado a continuación, autorizo formalmente a la ${LEGISLATURE_NAME} y a su ${instSettings.instituteName} a registrar y utilizar imágenes fotográficas y material audiovisual exclusivamente con fines de difusión pedagógica, institucional y cívica, conforme a las previsiones de la Ley Nacional 25.326 de Protección de Datos Personales.`
  );

  const splitLegal: string[] = doc.splitTextToSize(textoLegal, pageWidth - 2 * MARGIN);
  doc.text(splitLegal, MARGIN, y);
  y += splitLegal.length * 4 + 8;

  // Cuadro con campos a completar
  const campos = [
    'NOMBRE Y APELLIDO DEL ESTUDIANTE:',
    'DOCUMENTO DE IDENTIDAD (DNI):',
    'INSTITUCIÓN EDUCATIVA / COLEGIO:',
    'CURSO, AÑO O DIVISIÓN:',
    'NOMBRE Y APELLIDO DEL PADRE / MADRE / TUTOR:',
    'DNI DEL TUTOR:',
    'TELÉFONO DE CONTACTO URGENTE:',
  ];

  fill(doc, COLOR_BG_LIGHT);
  stroke(doc, COLOR_BORDER);
  doc.roundedRect(MARGIN, y, pageWidth - 2 * MARGIN, 80, 2, 2, 'FD');

  let campoY = y + 8;
  campos.forEach((campo) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    ink(doc, COLOR_PRIMARY);
    doc.text(campo, 20, campoY);

    stroke(doc, COLOR_MUTED);
    doc.line(85, campoY + 1, pageWidth - 25, campoY + 1);

    campoY += 10;
  });

  y += 95;

  // Firma
  const startX = 40;
  const widthFirma = pageWidth - 80;
  stroke(doc, COLOR_MUTED);
  doc.line(startX, y, startX + widthFirma, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  ink(doc, COLOR_PRIMARY);
  doc.text('FIRMA Y ACLARACIÓN DEL PADRE / MADRE / TUTOR', pageWidth / 2, y + 5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  ink(doc, COLOR_MUTED);
  doc.text('Lugar y Fecha: _________________________________', pageWidth / 2, y + 10, { align: 'center' });

  drawOfficialFooter(doc);
  doc.save('autorizacion-imagen-visitas-guiadas.pdf');
}
