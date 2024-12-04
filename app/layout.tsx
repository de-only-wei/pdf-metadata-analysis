import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PDF Metadata Viewer",
  description: "View PDF metadata easily",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <main className="min-h-screen bg-gray-100 py-8">{children}</main>
      </body>
    </html>
  );
}
