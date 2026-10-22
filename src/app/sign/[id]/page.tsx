import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { getRequest } from "@/server/sign-requests";
import { SignRequestClient } from "./SignRequestClient";

export const metadata: Metadata = { title: "Sign document", robots: { index: false } };

export default async function SignRequestPage({ params }: PageProps<"/sign/[id]">) {
  const { id } = await params;
  const req = getRequest(id);

  if (!req) {
    return (
      <section className="flex flex-1 flex-col items-center px-4 py-24 text-center">
        <Icon name="alert-triangle" size={48} className="text-brand" />
        <h1 className="mt-4 text-3xl font-bold">This signing link is not valid</h1>
        <p className="mt-2 text-muted">It may have expired (links last 30 days) or been typed incorrectly.</p>
        <Link href="/sign-pdf" className="btn-primary mt-8">Sign a PDF yourself</Link>
      </section>
    );
  }

  if (req.status === "signed") {
    return (
      <section className="flex flex-1 flex-col items-center px-4 py-24 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#6aa84f] text-white">
          <Icon name="check" size={36} />
        </span>
        <h1 className="mt-4 text-3xl font-bold">“{req.file_name}” has been signed</h1>
        <p className="mt-2 text-muted">
          Signed by {req.signer_name} on {new Date(req.signed_at!).toLocaleString()}.
        </p>
        <a href={`/api/sign-requests/${id}/file?signed=1`} className="btn-primary mt-8 !px-10 !py-4 text-lg">
          <Icon name="download" size={22} /> Download signed PDF
        </a>
      </section>
    );
  }

  return <SignRequestClient id={id} fileName={req.file_name} signerName={req.signer_name} message={req.message} />;
}
