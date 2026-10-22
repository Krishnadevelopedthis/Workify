import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { currentUser } from "@/server/auth";

export const metadata: Metadata = { title: "Login" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = String((await searchParams).next ?? "/");
  if (await currentUser()) redirect("/");
  return <AuthForm mode="login" next={next} />;
}
