import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-interface" });
const manrope = Manrope({ subsets: ["latin", "cyrillic"], variable: "--font-heading" });

export const metadata: Metadata = {
  title: "VK Ads Control",
  description: "Рекламные проекты под контролем",
  openGraph: {
    title: "VK Ads Control",
    description: "Рекламные проекты под контролем",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "VK Ads Control",
    description: "Рекламные проекты под контролем",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru" className={`${inter.variable} ${manrope.variable}`}><body><AppShell>{children}</AppShell></body></html>;
}
