import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Privacidad — Instituto de Capacitación Legislativa',
  description:
    'Política de privacidad del sistema interno de gestión del Instituto de Capacitación Legislativa (Poder Legislativo).',
  robots: { index: false, follow: false },
};

/**
 * Página pública de Política de Privacidad (sin login).
 * Google la exige al publicar la app OAuth; también está enlazada desde el footer
 * de la intranet. Sin dependencias de datos ni de sesión: solo contenido estático.
 */
export default function PrivacidadPage() {
  return (
    <div className="min-h-dvh bg-slate-100 py-10 px-4 sm:px-8">
      <main className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-10 space-y-6 text-[#1e293b]">
        <header className="space-y-2 border-b border-slate-100 pb-5">
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#001428]">
            Política de Privacidad
          </h1>
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
            Instituto de Capacitación Legislativa — Poder Legislativo
          </p>
          <p className="text-xs text-slate-500">
            Versión: 1.0 · Última actualización: Octubre 2026 · Aplica al sistema interno de
            gestión institucional (la &quot;Intranet&quot;) y a su encuesta pública de satisfacción.
          </p>
        </header>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-bold text-[#001428]">1. Responsable del tratamiento</h2>
          <p>
            El responsable del tratamiento de los datos personales recabados a través de este
            sistema es el <strong>Instituto de Capacitación Legislativa</strong> (Poder Legislativo),
            con domicilio institucional publicado en el pie de página de la Intranet. Los datos se
            tratan conforme a la Ley Nacional de Protección de Datos Personales{' '}
            <strong>25.326</strong> (Argentina) y su reglamentación.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-bold text-[#001428]">2. Qué datos se recopilan</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Datos de la cuenta de Google:</strong> nombre para mostrar, dirección de
              correo electrónico y (si corresponde) fotografía de perfil, al iniciar sesión con
              Google. No se accede a la contraseña.
            </li>
            <li>
              <strong>Datos operativos institucionales:</strong> agenda de actividades y visitas
              escolares (fechas, horarios, lugar, responsable, institución educativa, cantidad
              estimada de asistentes, estado de la actividad), novedades y comunicados internos,
              cursos y programas, recursos documentales, directorio del equipo (nombre, cargo,
              área, correo, teléfono, horario, cumpleaños si se carga) y configuración institucional.
            </li>
            <li>
              <strong>Auditoría de cursadas:</strong> registro de avance de lectura de los módulos
              de cada curso (momentos de cada check), estado de homologación y calificaciones de
              satisfacción (CSAT) con su comentario opcional.
            </li>
            <li>
              <strong>Encuesta pública de visitas:</strong> puntaje (1 a 5), comentario opcional y
              fecha de envío. Es anónima: no incluye nombre, correo ni identificación del
              respondente.
            </li>
            <li>
              <strong>Datos técnicos de sesión:</strong> tokens de sesión de Google (ID token y
              access token) que la propia plataforma almacena en el navegador del usuario para
              mantener la sesión activa y ejecutar integraciones (ver punto 4).
            </li>
          </ul>
          <p>
            El sistema <strong>no recaba datos personales de menores de edad</strong>: de las
            visitas escolares se registran únicamente la institución educativa y cantidades
            estimadas de asistentes, sin nóminas nominativas de estudiantes.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-bold text-[#001428]">3. Finalidades del tratamiento</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Autenticar a los integrantes autorizados y administrar sus roles y aprobaciones.</li>
            <li>Gestionar el cronograma institucional de actividades, visitas y capacitaciones.</li>
            <li>Distribuir comunicados y novedades internas al personal autorizado.</li>
            <li>Auditar la realización de cursos y emitir certificaciones internas.</li>
            <li>Medir la satisfacción de las instituciones escolares que realizaron visitas.</li>
            <li>Generar documentos oficiales (PDF, planillas) con los datos cargados.</li>
          </ul>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-bold text-[#001428]">
            4. Integraciones con Google Workspace
          </h2>
          <p>
            Si un usuario administrador conecta su cuenta de Google para las integraciones
            opcionales, el sistema puede, con su autorización expresa de OAuth:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Google Calendar:</strong> crear eventos de actividades institucionales en el
              calendario del usuario conectado.
            </li>
            <li>
              <strong>Google Sheets:</strong> crear planillas de registro y volcar filas de datos
              del cronograma.
            </li>
            <li>
              <strong>Gmail:</strong> enviar correos con el correo del usuario conectado (por
              ejemplo, la encuesta de satisfacción a instituciones educativas).
            </li>
          </ul>
          <p>
            Estas acciones se ejecutan <strong>únicamente cuando el administrador las solicita</strong>
            desde la interfaz. El sistema no lee correos, ni accede a archivos de Drive, ni realiza
            operaciones en nombre del usuario sin acción previa de este. El alcance otorgado puede
            revocarse en cualquier momento desde{' '}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0284c7] hover:underline"
            >
              Cuenta de Google → Aplicaciones con acceso
            </a>
            .
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-bold text-[#001428]">5. Donde se almacenan los datos</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Base de datos compartida (Cloud Firestore, Google Cloud):</strong> los datos
              institucionales listados en el punto 2, para que los integrantes autorizados vean la
              misma información. Se encuentra protegida por reglas de seguridad que limitan la
              lectura a usuarios aprobados y la escritura a administradores.
            </li>
            <li>
              <strong>Almacenamiento local del navegador:</strong> cada usuario conserva una copia
              de trabajo local (caché) y los tokens de sesión. La libreta de datos local no reemplaza
              la base compartida y puede borrarse limpiando los datos del navegador.
            </li>
            <li>
              <strong>Alojamiento de la aplicación:</strong> proveedor de hosting en la nube
              (p. ej. Netlify/Vercel) que sirve la aplicación.
            </li>
          </ul>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-bold text-[#001428]">6. Terceros que intervienen</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Google (Firebase / Google Cloud):</strong> autenticación, base de datos y attestation de la app (App Check). Sus políticas: firebase.google.com/support/privacy.</li>
            <li><strong>Proveedor de hosting:</strong> sirve la aplicación web (su log de acceso técnico puede registrarse conforme a sus políticas).</li>
          </ul>
          <p>
            El Instituto <strong>no vende, alquila ni cede</strong> datos personales a terceros con
            fines publicitarios o comerciales.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-bold text-[#001428]">7. Conservación y eliminación</h2>
          <p>
            Los datos se conservan mientras cumplan función en la gestión institucional o lo exija
            la normativa aplicable. El administrador puede eliminar registros concretos
            (actividades, comunicados, integrantes) desde los paneles de administración, y restablecer
            el conjunto de datos. Las respuestas de la encuesta pública no pueden modificarse
            (integridad del dato), pero pueden desactivarse los enlaces vigentes.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-bold text-[#001428]">
            8. Derechos de las personas (acceso, rectificación, cancelación, oposición)
          </h2>
          <p>
            Las personas titulares de los datos pueden ejercer los derechos previstos en la Ley
            25.326 (acceso, actualización, rectificación y supresión) escribiendo al correo de
            contacto institucional publicado en el pie de página de la Intranet. También pueden
            revocar el consentimiento de las integraciones de Google desde su cuenta de Google.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-bold text-[#001428]">9. Seguridad</h2>
          <p>
            El sistema implementa: autenticación con cuenta de Google verificada; control de acceso
            basado en roles reforzado por reglas de seguridad del lado del servidor; verificación de
            identidad en el endpoint de inteligencia artificial con límites de uso; sanitización de
            contenido de documentos; cabeceras de seguridad web (CSP, anti-clickjacking, HTTPS).
            Ningún sistema es absolutamente infalible: ante un incidente de seguridad relevante, se
            notificará conforme a la normativa aplicable.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-bold text-[#001428]">10. Uso de cookies y almacenamiento</h2>
          <p>
            El sistema no utiliza cookies publicitarias ni de seguimiento. Utiliza almacenamiento
            local del navegador (localStorage/sessionStorage) y la persistencia nativa de Firebase
            Authentication para mantener la sesión iniciada — funciones técnicas esenciales.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-bold text-[#001428]">11. Contacto</h2>
          <p>
            Consultas sobre esta política o sobre el tratamiento de datos: usar el correo de
            contacto institucional publicado en el pie de página de la Intranet, o dirigirse
            personalmente a la sede del Instituto de Capacitación Legislativa (Poder Legislativo).
          </p>
        </section>
      </main>
    </div>
  );
}
