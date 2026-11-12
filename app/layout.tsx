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

// Who made it, for search engines: the same person id as on jakobkavcic.com.
const AUTHOR = { name: "Jakob Kavčič", url: "https://jakobkavcic.com", id: "https://jakobkavcic.com/#person" };
const DESCRIPTION = "A quiet table companion. It listens, joins only when useful, and cites its sources.";
const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Third Wheel",
  description: DESCRIPTION,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any",
  isAccessibleForFree: true,
  url: "https://third-wheel-phi.vercel.app",
  sameAs: ["https://github.com/uraruguy/third-wheel"],
  author: { "@type": "Person", "@id": AUTHOR.id, name: AUTHOR.name, url: AUTHOR.url },
};

export const metadata: Metadata = {
  title: "Third Wheel",
  description: DESCRIPTION,
  applicationName: "Third Wheel",
  authors: [{ name: AUTHOR.name, url: AUTHOR.url }],
  creator: AUTHOR.name,
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
        />
        <RegisterSw />
        {children}
      </body>
    </html>
  );
}
