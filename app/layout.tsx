import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "DIT Workflow Toolkit", description: "Workflow-first DIT system planning tool" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ko"><body>{children}</body></html>;
}
