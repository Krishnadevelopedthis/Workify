import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = { title: "Contact us" };

export default function ContactPage() {
  return (
    <InfoPage icon="mail" title="Contact us" subtitle="Questions, feedback or business enquiries — send us a message.">
      <ContactForm />
    </InfoPage>
  );
}
