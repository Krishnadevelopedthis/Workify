import type { Metadata } from "next";
import { FeatureGrid, InfoPage } from "@/components/InfoPage";
import { InstallApp } from "@/components/InstallApp";

export const metadata: Metadata = { title: "Workify Desktop" };

export default function DesktopPage() {
  return (
    <InfoPage icon="device-desktop" title="Workify Desktop" subtitle="Install Workify on Windows, macOS or Linux and open it like any other app." wide>
      <div className="mx-auto mb-12 max-w-xl rounded-2xl border border-line bg-white p-8 text-center">
        <h2 className="mb-4 text-xl font-bold">Install in one click</h2>
        <InstallApp />
      </div>
      <FeatureGrid
        items={[
          { icon: "device-desktop", title: "Its own window", text: "Workify opens in a clean app window from your Start menu, Dock or desktop, without browser tabs." },
          { icon: "bolt", title: "One click away", text: "Launch Workify straight to your tools, without hunting for a bookmark." },
          { icon: "refresh", title: "Always up to date", text: "Updates arrive automatically. There is nothing to download or reinstall." },
        ]}
      />
    </InfoPage>
  );
}
