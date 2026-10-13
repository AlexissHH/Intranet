import { CsatSurveyForm } from '@/components/CsatSurveyForm';

// Página pública de encuesta de satisfacción (CSAT) de visitas escolares:
// fuera del shell de la intranet, sin login. El token llega por la ruta.
export default async function EncuestaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CsatSurveyForm token={token} />;
}
