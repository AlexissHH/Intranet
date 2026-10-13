# Registro de revisión (Secciones 1–3)

## Archivos nuevos
- `lib/access-config.ts` – fuente única de admins/visitantes (cliente y servidor).
- `lib/server/firebase-token.ts` – verificación de ID tokens de Firebase sin dependencias nuevas.
- `lib/server/rate-limit.ts` – límite de uso por usuario (por instancia).

## Archivos modificados
`app/api/gemini/generate/route.ts`, `components/GeminiAssistantModal.tsx`, `lib/auth.ts`, `lib/workspace.ts`,
`lib/storage.ts`, `lib/utils.ts`, `next.config.ts`, `.env.example`, `.gitignore`, `package.json` (script `typecheck`),
`README.md`; ajustes mínimos de consumo en `BackupModal`, `HomeSection`, `AdminSection`, `TrainingSection`.

## Archivos eliminados
- `src/assets/images/logo_legislatura_1791039565201.jpg` (duplicado byte a byte de `public/logo_legislatura.jpg`, sin referencias).

## Pendiente de validar con dependencias instaladas
`bun run typecheck`, `bun run build`, login con Google en una vista previa de Vercel.

---

# Registro de revisión (Secciones 4–6)

## Corregido
- **Build:** `createGoogleSheet` devolvía `unknown` y `app/page.tsx` leía `.spreadsheetId` de él (error de tipos que habría
  roto `next build` en Vercel). Ahora devuelve `CreatedSpreadsheet` y valida que Google haya enviado el id.
- **Google Sheets:** el rango `Registro Instituto!A1` (hoja con espacio) ahora se envía entrecomillado (`normalizeSheetRange`).
- **Token de Google:** `getAccessToken()` ya no devuelve un token en memoria vencido (~1 h); se revalida contra su vencimiento real.
- **Administradores:** `instcapacitacionlegis@gmail.com` se suma a `alexishinojosa1600@gmail.com` (`lib/access-config.ts`);
  ambos se siembran/reparan en la lista de usuarios. Siguen requiriendo ingreso con Google.
- **`lib/pdfGenerator.ts`:** reescrito (alturas dinámicas, saltos de página, texto seguro para la fuente base del PDF,
  nombre de institución desde los ajustes, sin "35 asistentes" inventados).
- **`lib/mock-data.ts`:** marcas de tiempo de auditorías alineadas con las fechas mostradas; registros de ejemplo marcados
  `isSample` (no cuentan en CSAT ni en "agentes formados"); DNIs reales/ficticios de la planilla modelo reemplazados por marcadores.
- **Asistentes inventados:** se quitaron los valores por defecto 25/28/35 en `HomeSection`, `AdminSection` y `AgendaSection`.
- **`useBottomSheetDrag`:** sin fugas de listeners/timeouts al desmontar; handlers duplicados de move/up eliminados.
- **`app/page.tsx`:** toasts con un solo temporizador, helpers únicos de eventos de Calendar, errores de sincronización
  pendientes ahora visibles, resumen honesto al sincronizar cumpleaños, privacidad (el evento ya no incluye teléfono, email ni domicilio).
- **`app/layout.tsx`:** metadatos sin duplicar, `noindex` (es una intranet), tarjeta de Twitter coherente (`summary`).
- **Login / Restringido / Usuarios:** nombre del instituto tomado de los ajustes, accesibilidad (roles, labels, teclado),
  lista de usuarios que se actualiza al abrir, confirmación antes de eliminar, validación de correo.
- Tono neutro (tú) en los pocos textos con voseo.

## Eliminado (por ser innecesario o falso)
- `hooks/use-mobile.ts` (sin ningún uso).
- Pie de página: el cartel inventado "Servidores activos • 99.98% uptime", la versión inventada "3.4.1 • Sistema Oficial" y los
  4 enlaces de "Normativa" que no abrían ningún documento (reemplazados por "Documentación": Recursos y Enlaces).
- Textos "Contenido Cifrado" y "Dispositivo verificado" (no eran ciertos).

---

# Registro de revisión (Secciones 7–8)

## Corregido
- **Header:** "Cerrar sesión" pasaba el evento del clic como parámetro `silent` y cerraba la sesión sin avisar; ahora avisa.
  La fecha ya no arranca con un texto fijo inventado, usa la zona horaria institucional y se actualiza pasada la medianoche.
  El logo ahora es un botón accesible y el menú marca la sección activa (`aria-current`).
- **WorkspaceBanner:** "Ver Calendario" creaba (tras confirmar) un evento con la primera actividad de la agenda; ahora abre Google Calendar.
  Los textos de estado ya no afirman más de lo que se sabe ("Google conectado").
- **Login con Workspace:** cuando el login se abre para conectar Calendar/Sheets/Gmail, la opción de permisos de Workspace viene tildada.
- **BackupModal:** nuevo selector de archivo `.json`, confirmación antes de importar, estado limpio al abrir, aviso de que el respaldo
  contiene datos personales y de que "Restablecer" también borra las auditorías de cursadas.
- **ConfirmationModal / BottomSheetHandle:** roles accesibles correctos (`alertdialog`, `separator` en lugar de un `slider` falso);
  los valores largos del detalle ya no se cortan.
- **GmailComposerModal:** el texto base usa el nombre del instituto de los ajustes; validación sin espacios en blanco; el cierre
  diferido ya no afecta a un modal nuevo; si Google rechaza el token, la app lo descarta y pide reconectar.
- **QuickActionsModal:** se eliminaron valores inventados (35/30/20 asistentes, responsable "Lic. Mariana Varela", nota "Ingreso por
  explanada central."); validación de hora de fin; validación de la imagen de la novedad (solo https, ruta del sitio o archivo subido);
  fecha de la novedad en zona horaria institucional; interruptor de Calendar unificado en un solo componente accesible.
- **Asistente de IA:** interruptor único `NEXT_PUBLIC_AI_ASSISTANT_ENABLED` (apagado por defecto). Sin él, ya no hay botones que no
  hacen nada (el "Diseñar con IA" de Capacitación).

## Eliminado
- Punto rojo fijo de la campana del Header (simulaba notificaciones inexistentes); la campana ahora es "Ir a la agenda".
- Prop `onOpenAiAssistant` del Header (no se usaba) y prop `onOpenQuickEvent` del WorkspaceBanner.
- Primer valor "Lic. Mariana Varela" como responsable por defecto de las visitas.
