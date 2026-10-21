import { getLocalDateString, getOffsetDateString } from './utils';

export interface ActivityItem {
  id: string;
  title: string;
  type: 'visita' | 'capacitacion' | 'evento' | 'reunion';
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  location: string;
  responsible: string;
  attendeesCount?: number;
  institution?: string; // Para visitas escolares
  level?: string; // Nivel primario, secundario, etc.
  description: string;
  status: 'confirmada' | 'en_curso' | 'pendiente' | 'finalizada' | 'cancelada';
  notes?: string;
  /** Email de contacto de la institución (destinatario de la encuesta CSAT). */
  contactEmail?: string;
  /** Teléfono o celular de contacto de la institución / docente. */
  contactPhone?: string;
  cancellationReason?: string;
  statusUpdatedAt?: string;
  /** Encuesta CSAT de satisfacción de la visita: token y fecha del último envío. */
  csatSurveyToken?: string;
  csatSurveySentAt?: string;
}

export type InstituteAreaIconName =
  | 'Scale'
  | 'GraduationCap'
  | 'Users'
  | 'Cpu'
  | 'FileCheck2'
  | 'Building2'
  | 'Shield'
  | 'Compass'
  | 'Target'
  | 'Award'
  | 'BookOpen'
  | 'Landmark';

export interface InstituteAreaCard {
  id: string;
  title: string;
  role: string;
  desc: string;
  tag: string;
  iconName: InstituteAreaIconName;
  order: number;
}

export interface NewsItem {
  id: string;
  title: string;
  date: string;
  category: 'Institucional' | 'Urgente' | 'Capacitación' | 'Programas' | 'Novedad';
  summary: string;
  content: string;
  author: string;
  pinned?: boolean;
  isAnnouncement?: boolean;
  imageUrl?: string;
  resolutionUrl?: string;
}

export interface TrainingCourse {
  id: string;
  title: string;
  category: string;
  modality: 'Presencial' | 'Híbrida' | 'Virtual Asincrónica' | 'Virtual Sincrónica';
  durationHours: number;
  targetAudience: string;
  status: 'Inscripciones abiertas' | 'En curso' | 'Próximamente' | 'Completado';
  instructor: string;
  description: string;
  syllabus: string[];
  schedule: string;
  formUrl?: string;
  driveFolderUrl?: string;
}

export interface CourseModuleCheck {
  unitIndex: number;
  unitTitle: string;
  completedAt: string; // "02/10/2026, 14:22"
  timestamp: number;   // Epoch ms
}

export interface AgentCourseAudit {
  id: string;
  courseId: string;
  courseTitle: string;
  durationHours: number;
  agentName: string;
  agentEmail: string;
  agentArea: string;
  checks: CourseModuleCheck[];
  totalModules: number;
  completedModulesCount: number;
  isFullyCompleted: boolean;
  firstCheckTimestamp?: number;
  lastCheckTimestamp?: number;
  timeDeltaMinutes: number; // Intervalo de tiempo transcurrido entre primer y último módulo
  auditStatus: 'en_progreso' | 'consistente' | 'alerta_simultanea' | 'aprobado_admin' | 'observado';
  auditVerdict: string;
  csatRating?: 'Muy Satisfecho' | 'Satisfecho' | 'Neutral' | 'Insatisfecho';
  csatComment?: string;
  certifiedAt?: string;
  adminNotes?: string;
  /** Registro de ejemplo (demostración): no cuenta en estadísticas ni en métricas reales. */
  isSample?: boolean;
}

export interface ProjectProgram {
  id: string;
  title: string;
  code: string;
  badge: string;
  targetAudience: string;
  summary: string;
  description: string;
  objectives: string[];
  activities: string[];
  stats: { label: string; value: string }[];
  contactEmail: string;
  iconName: string;
}

export interface ResourceDocument {
  id: string;
  title: string;
  category: 'nota_modelo' | 'formulario' | 'protocolo' | 'material_institucional' | 'presentacion' | 'visita_escolar';
  format: 'DOCX' | 'PDF' | 'SHEET' | 'FORM' | 'SLIDES';
  description: string;
  updatedAt: string;
  driveUrl?: string;
  contentTemplate?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string; // Puesto / Función laboral (roles que cumplen en el trabajo no en la página)
  area: string;
  email: string;
  phone: string;
  phoneExtension?: string;
  birthday: string; // e.g. "19/03", "05/01/1984"
  location: string;
  responsibilities: string[];
  schedule: string;
  avatarSeed?: string;
}

export interface QuickLink {
  id: string;
  title: string;
  url: string;
  category: 'Google Workspace' | 'Diseño y Comunicación' | 'Gestión Legislativa' | 'Otros';
  description: string;
  iconType: 'drive' | 'sheets' | 'forms' | 'gmail' | 'calendar' | 'canva' | 'globe' | 'file';
  isExternal: boolean;
}

/**
 * Colecciones iniciales VACÍAS: la intranet arranca desde cero, sin datos de prueba.
 * Si en el futuro se necesita sembrar contenido de ejemplo, se recrea aquí y el
 * bootstrap de Firestore lo publica automáticamente en la base compartida.
 */
export const INITIAL_INSTITUTE_AREAS: InstituteAreaCard[] = [];
export const INITIAL_ACTIVITIES: ActivityItem[] = [];
export const INITIAL_NEWS: NewsItem[] = [];
export const INITIAL_COURSES: TrainingCourse[] = [];
export const INITIAL_PROGRAMS: ProjectProgram[] = [];
export const INITIAL_RESOURCES: ResourceDocument[] = [];
export const INITIAL_TEAM: TeamMember[] = [];
export const INITIAL_LINKS: QuickLink[] = [];
export const INITIAL_COURSE_AUDITS: AgentCourseAudit[] = [];
