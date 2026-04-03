import type { Metadata } from "next";
import "./globals.css";
import { LayoutWrapper } from "./LayoutWrapper";
import { AppProvider } from "@/context/AppContext";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";

export const metadata: Metadata = {
  title: "Qalam — LinkedIn Automation Dashboard",
  description: "Manage your LinkedIn content with AI-powered automation",
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Qalam',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    shortcut: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="PostFlow" />
        <meta name="theme-color" content="#0071e3" />
      </head>
      <body className="bg-bg text-text-primary font-sans antialiased">
        <AppProvider>
          <LayoutWrapper>{children}</LayoutWrapper>
        </AppProvider>
        <ServiceWorkerRegistration />
        <PWAInstallPrompt />
      </body>
    </html>
  );
}
