import Link from "next/link";
import { Icon } from "@/components/Icon";

export default function NotFound() {
  return (
    <section className="flex flex-1 flex-col items-center px-4 py-24 text-center">
      <p className="text-7xl font-extrabold text-brand">404</p>
      <h1 className="mt-4 text-2xl font-bold">This page could not be found</h1>
      <p className="mt-2 text-muted">The link may be broken, or the page may have moved.</p>
      <Link href="/" className="btn-primary mt-8">
        <Icon name="arrow-left" size={18} /> Back to all tools
      </Link>
    </section>
  );
}
