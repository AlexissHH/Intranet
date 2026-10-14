# Intranet – Instituto de Capacitación Legislativa

Portal interno: agenda institucional, visitas escolares, capacitaciones, novedades, recursos,
equipo y sincronización con Google Workspace (Calendar, Sheets, Gmail). Incluye un asistente de
redacción con Gemini.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript estricto · Tailwind 4 · Firebase Auth + Firestore (backend compartido) · Google Gemini.

## Ejecutar en local

```bash
bun install        # o npm install (usar UN solo gestor; el repositorio trae bun.lock)
cp .env.example .env.local   # completar los valores
bun run dev        # http://localhost:3000
bun run typecheck  # verificación de tipos
```

## Desplegar en Vercel

1. Importar el repositorio en Vercel (framework: Next.js).
2. Cargar las variables de `.env.example` en *Settings → Environment Variables*.
   `GEMINI_API_KEY` y `AI_*` son secretas (sin prefijo `NEXT_PUBLIC_`).
3. En Firebase Console → *Authentication → Settings → Authorized domains*, agregar el dominio de Vercel.
4. Probar en una vista previa: login con Google, PDF, vista de .docx y asistente de IA.
   Si la consola del navegador no muestra violaciones de CSP, poner `CSP_MODE=enforce`.

## Desplegar en Netlify

1. Importar el repositorio en Netlify (detcta Next.js: el repo incluye `netlify.toml` con el
   runtime oficial `@netlify/plugin-nextjs`; build `npm run build`, publish `.next`).
2. Cargar las variables de `.env.example` en *Site settings → Environment variables*
   (`GEMINI_API_KEY` es secreta de servidor; las `NEXT_PUBLIC_*` se fijan al build).
3. En Firebase Console → *Authentication → Authorized domains*, agregar el dominio de Netlify.
4. Limitación honesta: las funciones sincrónicas de Netlify tienen un timeout default de 10 s
   (extensible a ~26 s en la configuración del sitio). El modo "thinking" del asistente
   puede excederlo en consultas largas; "fast" y "general" están detrás de ese margen.

## Seguridad: qué hay y qué falta

- El asistente de IA está apagado por defecto: se enciende con `NEXT_PUBLIC_AI_ASSISTANT_ENABLED=true`. Su endpoint (`/api/gemini/generate`) exige un **ID token de Firebase verificado en el servidor**,
  limita el uso por usuario y no acepta contexto enviado por el cliente.
- Las claves de Firebase del cliente son públicas por diseño; **lo que protege los datos son las
  Security Rules** (`firestore.rules`).

## Base de datos compartida (Firestore)

Los datos institucionales (agenda, usuarios aprobados, auditorías de cursada, configuración)
viven en **Firebase Firestore** como fuente de verdad compartida entre dispositivos.
`localStorage` funciona como caché local/offline: siempre que no haya conexión con Firestore,
la app sigue funcionando y reintenta con cada cambio.

### Activar por primera vez (una vez)

1. Firebase Console → *Firestore Database* → **Crear base de datos** (modo producción, región
   `southamerica-east1` recomendada). Sin este paso, la app muestra un aviso y sigue en modo
   solo-local.
2. Publicar las reglas: copiar `firestore.rules` en Console → Firestore → *Rules* → *Publish*,
   o desplegar con la CLI (`firebase deploy --only firestore:rules`).
3. Iniciar sesión con la cuenta de administrador maestro: sus documentos de usuario y las
   colecciones iniciales (datos de `lib/mock-data.ts`) se siembran automáticamente en el primer
   cambio o al cargar la intranet.

### Qué se controla con las Security Rules

- **Leer contenido del instituto**: solo cuentas de Google verificadas con estado `aprobado`
  en `authorized_users` (o administradores maestros).
- **Escribir contenido**: solo administradores (maestros definidos dentro de `firestore.rules`,
  o usuarios promovidos y aprobados en `authorized_users`).
- **Visitas pendientes**: pueden crear su propia ficha como `pendiente`; un visitante no puede
  auto-aprobarse, salvo que el modo compartido `auto_visitor` esté activado por un admin.
- **Auditorías de cursada**: el visitante solo puede escribir sus propios checks (la lista de
  campos permitidos está acotada); homologar/certificar es exclusivo de admins.

### Seguridad adicional: App Check

Cuando se cargue una `recaptchaSiteKey` (en `firebase-applet-config.json` o `NEXT_PUBLIC_APPCHECK_SITE_KEY`),
la app inicializa **Firebase App Check (reCAPTCHA v3)**: attestation de que las llamadas vienen
de esta web, complemento oficial de Security Rules contra scripts externos que usen la API key
pública. Sin site key, App Check queda inactivo. Para aplicar: revisar métricas en
Firebase Console → App Check → *Aplicación* (Firestore), siguiendo la guía oficial.

### Limitaciones conocidas del modelo (última escritura gana)

- No hay control optimista de revisiones: dos administradores editando el mismo registro a la
  vez se sobrescriben entre sí (el último guardado gana). Para el uso interno de la intranet
  es aceptable; si algún día se necesita colaboración concurrente real, evaluar transacciones
  con `serverTimestamp()`.
- Las imágenes base64 mayores a ~1 MB no pueden subirse a Firestore (límite por documento);
  el resto del registro se comparte igual y se avisa por toast.
- El modo de aprobación (`auto_visitor`) es compartido entre administradores; la sesión de
  Google de cada usuario, en cambio, siempre vive en su propio navegador.
