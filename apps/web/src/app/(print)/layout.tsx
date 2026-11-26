/**
 * Páginas feitas para imprimir (o cartaz A4 do QR de convite, #372): sem
 * barra, sem menu e sem login. O conteúdo é o que o link de convite já mostra.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background print:bg-white">{children}</div>;
}
