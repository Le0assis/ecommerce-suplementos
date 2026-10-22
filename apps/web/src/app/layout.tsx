import { StoreDataProvider } from "@/components/store-data";
import { CartDrawer, CookieBanner, Toaster } from "@/components/layout/chrome";
import { siteConfig } from "@/lib/config";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Bebas_Neue, Outfit } from "next/font/google";
import "./globals.css";

const display = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });
const sans = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: { default: "PULSO — suplementos com cara de rua", template: "%s · PULSO" },
  description: siteConfig.description,
  openGraph: { title: "PULSO", description: siteConfig.description, locale: "pt_BR", type: "website" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${sans.variable} h-full`}>
      <body className="min-h-full font-sans antialiased">
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:rounded-full focus:bg-lime focus:px-4 focus:py-2 focus:text-primary-foreground">
          Pular para o conteúdo
        </a>
        <StoreDataProvider>
          {children}
          <CartDrawer />
          <CookieBanner />
          <Toaster />
        </StoreDataProvider>
      </body>
    </html>
  );
}
