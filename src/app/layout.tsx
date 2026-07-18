import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Doctovio — Gestión médica que fluye",
    template: "%s · Doctovio",
  },
  description: "Agenda, expedientes, recetas y cobros para consultorios médicos.",
  applicationName: "Doctovio",
};

export const viewport: Viewport = {
  themeColor: "#0D2B45",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
