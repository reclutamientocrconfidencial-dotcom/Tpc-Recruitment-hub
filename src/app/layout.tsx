import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "TPC Recruitment Hub", template: "%s · TPC Recruitment Hub" },
  description: "Sistema de reclutamiento (ATS) de The People Outsourcing Company S.A., Costa Rica.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#c8102e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CR">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
