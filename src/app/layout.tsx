import type { Metadata, Viewport } from "next";
import { SITE_URL } from "@/lib/site";
import { Geist, Geist_Mono } from "next/font/google";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Workify | Online PDF tools for everyone",
    template: "%s | Workify",
  },
  description:
    "Workify is a free online service to work with PDF files: merge, split, compress, convert, rotate, unlock and watermark PDFs with just a few clicks.",
  applicationName: "Workify",
  keywords: ["PDF", "merge PDF", "split PDF", "compress PDF", "PDF converter", "edit PDF", "sign PDF", "free PDF tools"],
  openGraph: {
    type: "website",
    siteName: "Workify",
    title: "Workify | Every PDF tool in one place",
    description: "Merge, split, compress, convert, edit and sign PDFs for free.",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Workify" }],
  },
  twitter: { card: "summary", title: "Workify | Every PDF tool in one place", images: ["/icon-512.png"] },
};

export const viewport: Viewport = { themeColor: "#e5322d" };

// No cookies or other per-request data here, so pages can be prerendered and
// served from a CDN; the header fetches the signed-in user itself.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Header />
        <main className="flex flex-1 flex-col">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
