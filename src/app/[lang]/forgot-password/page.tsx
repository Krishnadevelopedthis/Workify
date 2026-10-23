import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { ForgotForm } from "./ForgotForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Forgot password"), robots: { index: false } };
}

export default function ForgotPasswordPage() {
  return <ForgotForm />;
}
