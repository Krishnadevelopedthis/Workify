import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { currentUser } from "@/server/auth";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const next = String((await searchParams).next ?? "/");
  if (await currentUser()) redirect("/");
  return <AuthForm mode="signup" next={next} />;
}
