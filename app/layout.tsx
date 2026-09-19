import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { RegisterSw } from "@/components/register-sw";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
});

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Third Wheel",
  description:
    "A quiet table companion. It listens, joins only when useful, and cites its sources.",
  applicationName: "Third Wheel",
  appleWebApp: {
    capable: true,
    title: "Third Wheel",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c0d10",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <RegisterSw />
        {children}
      </body>
    </html>
  );
}
