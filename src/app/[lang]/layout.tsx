import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { I18nProvider } from "@/i18n/client";
import { LOCALES, RTL_LOCALES } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { loadMessages } from "@/i18n/translate";
import { SITE_URL } from "@/lib/site";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const dynamicParams = false;
export const generateStaticParams = () => LOCALES.map((lang) => ({ lang }));

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  const tagline = t("Every PDF tool in one place");
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: `Workify | ${t("Online PDF tools for everyone")}`,
      template: "%s | Workify",
    },
    description: t(
      "Workify is a free online service to work with PDF files: merge, split, compress, convert, rotate, unlock and watermark PDFs with just a few clicks.",
    ),
    applicationName: "Workify",
    keywords: ["PDF", "merge PDF", "split PDF", "compress PDF", "PDF converter", "edit PDF", "sign PDF", "free PDF tools"],
    openGraph: {
      type: "website",
      siteName: "Workify",
      title: `Workify | ${tagline}`,
      description: t("Merge, split, compress, convert, edit and sign PDFs for free."),
      images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Workify" }],
    },
    twitter: { card: "summary", title: `Workify | ${tagline}`, images: ["/icon-512.png"] },
  };
}

export const viewport: Viewport = { themeColor: "#e5322d" };

// No cookies or other per-request data here, so pages can be prerendered and
// served from a CDN; the header fetches the signed-in user itself.
export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const { lang } = await getT();
  return (
    <html
      lang={lang}
      dir={RTL_LOCALES.includes(lang) ? "rtl" : "ltr"}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <I18nProvider lang={lang} messages={await loadMessages(lang)}>
          <Header />
          <main className="flex flex-1 flex-col">{children}</main>
          <Footer />
        </I18nProvider>
      </body>
    </html>
  );
}
