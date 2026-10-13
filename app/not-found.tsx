import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#001428] text-white flex items-center justify-center font-bold text-2xl shadow-lg mb-6">
        404
      </div>
      <h1 className="text-2xl font-extrabold text-[#001428] mb-2">
        Página no encontrada
      </h1>
      <p className="text-sm text-slate-600 max-w-md mb-6">
        La sección que estás buscando no existe o ha sido movida. Puedes regresar a la portada de la Intranet.
      </p>
      <Link
        href="/"
        className="px-5 py-2.5 rounded-lg bg-[#001428] hover:bg-[#0e4a7b] text-white text-xs font-bold transition-colors shadow-xs"
      >
        Volver al Inicio
      </Link>
    </div>
  );
}
