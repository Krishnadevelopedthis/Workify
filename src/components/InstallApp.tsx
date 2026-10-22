"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** "Install Workify" button using the browser's PWA install prompt when available. */
export function InstallApp() {
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return <p className="font-semibold text-[#4a8a32]">Workify is installed. Look for it in your apps.</p>;
  if (!prompt) {
    return (
      <p className="text-sm text-muted">
        Your browser will offer an <strong>Install</strong> option in its menu (Chrome/Edge: the install icon in the
        address bar; Safari on iPhone: Share → Add to Home Screen).
      </p>
    );
  }
  return (
    <button
      className="btn-primary"
      onClick={async () => {
        await prompt.prompt();
        if ((await prompt.userChoice).outcome === "accepted") setInstalled(true);
        setPrompt(null);
      }}
    >
      <Icon name="download" size={20} /> Install Workify
    </button>
  );
}
