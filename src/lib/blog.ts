export type Post = { slug: string; title: string; date: string; excerpt: string; body: string[] };

export const POSTS: Post[] = [
  {
    slug: "how-to-merge-pdf-files",
    title: "How to merge PDF files in the right order",
    date: "2026-10-01",
    excerpt: "Combine reports, scans and receipts into one tidy PDF in a few clicks.",
    body: [
      "Open Merge PDF and drop all your files onto the page, or click Select PDF files.",
      "Drag the file cards into the order you want. Use Sort A-Z if your files are numbered, and the rotate button on any card that is sideways.",
      "Click Merge PDF. Your merged file downloads automatically, and you can continue straight to Compress PDF or Add page numbers.",
    ],
  },
  {
    slug: "compress-pdf-for-email",
    title: "Make a PDF small enough to email",
    date: "2026-10-08",
    excerpt: "Pick the right compression level for scans, slides and photo-heavy documents.",
    body: [
      "Recommended compression gives a good balance for most documents and is usually enough to get under email limits.",
      "Extreme compression reduces image resolution further. It is ideal for scanned pages that only need to be readable on screen.",
      "Less compression keeps images sharp for printing. If a file is still too large, try Split PDF to send it in parts.",
    ],
  },
  {
    slug: "redaction-vs-black-boxes",
    title: "Why drawing a black box is not redaction",
    date: "2026-10-15",
    excerpt: "Covering text with a shape leaves it in the file. Real redaction removes it.",
    body: [
      "A black rectangle drawn in an editor only hides text visually. Anyone can still copy the text underneath or remove the shape.",
      "Redact PDF deletes the text, image pixels and drawings under each marked area, and can search for a word or number across the whole document.",
      "After redacting, try selecting the area in a PDF reader: there is nothing left to copy.",
    ],
  },
];
