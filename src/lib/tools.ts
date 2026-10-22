// Single source of truth for every Workify tool: card text, category,
// accepted files, options shown in the sidebar, and availability.

export type Category =
  | "organize"
  | "optimize"
  | "convert"
  | "edit"
  | "security"
  | "intelligence"
  | "workflows";

export const CATEGORIES: { id: Category | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "workflows", label: "Workflows" },
  { id: "organize", label: "Organize PDF" },
  { id: "optimize", label: "Optimize PDF" },
  { id: "convert", label: "Convert PDF" },
  { id: "edit", label: "Edit PDF" },
  { id: "security", label: "PDF Security" },
  { id: "intelligence", label: "PDF Intelligence" },
];

type ShowIf = { key: string; equals: string | string[] };

export type ToolOption =
  | {
      type: "choice";
      key: string;
      label: string;
      default: string;
      choices: { value: string; label: string; hint?: string }[];
      showIf?: ShowIf;
    }
  | {
      type: "text" | "password";
      key: string;
      label: string;
      default: string;
      placeholder?: string;
      hint?: string;
      required?: boolean;
      showIf?: ShowIf;
    }
  | {
      type: "number";
      key: string;
      label: string;
      default: number;
      min?: number;
      max?: number;
      step?: number;
      showIf?: ShowIf;
    }
  | { type: "checkbox"; key: string; label: string; default: boolean; showIf?: ShowIf }
  | { type: "color"; key: string; label: string; default: string; showIf?: ShowIf }
  | { type: "position"; key: string; label: string; default: string; showIf?: ShowIf }
  | { type: "file"; key: string; label: string; accept: string; showIf?: ShowIf };

export type Tool = {
  slug: string;
  name: string;
  description: string;
  /** Heading + subheading on the tool page. */
  title: string;
  subtitle: string;
  category: Category;
  /** Also listed under "Convert" when it converts from PDF, etc. */
  icon: string;
  badge?: string;
  color: string;
  accept: string;
  acceptLabel: string;
  multiple: boolean;
  minFiles?: number;
  /** Button label in the options sidebar. */
  action: string;
  options?: ToolOption[];
  /** Interactive tools use a dedicated editor instead of the generic sidebar. */
  editor?:
    | "organize"
    | "rotate"
    | "edit"
    | "sign"
    | "redact"
    | "crop"
    | "forms"
    | "compare"
    | "scan"
    | "html"
    | "workflow";
  unavailable?: string;
  isNew?: boolean;
};

const PDF = ".pdf,application/pdf";
const POSITIONS = "tl,tc,tr,ml,mc,mr,bl,bc,br";
export const POSITION_VALUES = POSITIONS.split(",");

export const TOOLS: Tool[] = [
  {
    slug: "merge-pdf",
    name: "Merge PDF",
    description: "Combine PDFs in the order you want with the easiest PDF merger available.",
    title: "Merge PDF files",
    subtitle: "Combine PDFs in the order you want with the easiest PDF merger available.",
    category: "organize",
    icon: "arrows-join-2",
    color: "#e5322d",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    minFiles: 2,
    action: "Merge PDF",
  },
  {
    slug: "split-pdf",
    name: "Split PDF",
    description: "Separate one page or a whole set for easy conversion into independent PDF files.",
    title: "Split PDF file",
    subtitle: "Separate one page or a whole set for easy conversion into independent PDF files.",
    category: "organize",
    icon: "arrows-split-2",
    color: "#e5322d",
    accept: PDF,
    acceptLabel: "PDF file",
    multiple: false,
    action: "Split PDF",
    options: [
      {
        type: "choice",
        key: "mode",
        label: "Split mode",
        default: "custom",
        choices: [
          { value: "custom", label: "Custom ranges", hint: "Split into ranges you define" },
          { value: "fixed", label: "Fixed ranges", hint: "Split every N pages" },
          { value: "all", label: "Extract all pages", hint: "Every page becomes a PDF" },
          { value: "select", label: "Select pages", hint: "Extract the pages you list" },
          { value: "size", label: "By size", hint: "Keep each file under a size" },
        ],
      },
      {
        type: "text",
        key: "ranges",
        label: "Ranges",
        default: "1-1",
        placeholder: "1-3, 4-6, 7-10",
        hint: "Each range becomes one PDF.",
        showIf: { key: "mode", equals: "custom" },
      },
      {
        type: "number",
        key: "every",
        label: "Split every N pages",
        default: 1,
        min: 1,
        showIf: { key: "mode", equals: "fixed" },
      },
      {
        type: "text",
        key: "pages",
        label: "Pages to extract",
        default: "1",
        placeholder: "1, 3, 5-8",
        showIf: { key: "mode", equals: "select" },
      },
      {
        type: "number",
        key: "maxMb",
        label: "Maximum size per file (MB)",
        default: 5,
        min: 0.1,
        step: 0.1,
        showIf: { key: "mode", equals: "size" },
      },
      {
        type: "checkbox",
        key: "mergeOutput",
        label: "Merge all ranges in one PDF file",
        default: false,
        showIf: { key: "mode", equals: ["custom", "select"] },
      },
    ],
  },
  {
    slug: "compress-pdf",
    name: "Compress PDF",
    description: "Reduce file size while optimizing for maximal PDF quality.",
    title: "Compress PDF files",
    subtitle: "Reduce file size while optimizing for maximal PDF quality.",
    category: "optimize",
    icon: "arrows-minimize",
    color: "#6aa84f",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    action: "Compress PDF",
    options: [
      {
        type: "choice",
        key: "level",
        label: "Compression level",
        default: "recommended",
        choices: [
          { value: "extreme", label: "Extreme compression", hint: "Less quality, high compression" },
          { value: "recommended", label: "Recommended compression", hint: "Good quality, good compression" },
          { value: "less", label: "Less compression", hint: "High quality, less compression" },
        ],
      },
    ],
  },
  {
    slug: "pdf-to-word",
    name: "PDF to Word",
    description: "Easily convert your PDF files into easy to edit DOC and DOCX documents. The converted Word document is almost 100% accurate.",
    title: "Convert PDF to WORD",
    subtitle: "Convert your PDF to WORD documents with incredible accuracy.",
    category: "convert",
    icon: "file-export",
    badge: "W",
    color: "#2b5797",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    action: "Convert to WORD",
  },
  {
    slug: "pdf-to-powerpoint",
    name: "PDF to PowerPoint",
    description: "Turn your PDF files into easy to edit PPT and PPTX slideshows.",
    title: "Convert PDF to POWERPOINT",
    subtitle: "Turn your PDF files into easy to edit PPT and PPTX slideshows.",
    category: "convert",
    icon: "file-export",
    badge: "P",
    color: "#d24726",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    action: "Convert to PPTX",
  },
  {
    slug: "pdf-to-excel",
    name: "PDF to Excel",
    description: "Pull data straight from PDFs into Excel spreadsheets in a few short seconds.",
    title: "Convert PDF to EXCEL",
    subtitle: "Convert PDF data to Excel spreadsheets in a few clicks.",
    category: "convert",
    icon: "file-export",
    badge: "X",
    color: "#1e7145",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    action: "Convert to EXCEL",
  },
  {
    slug: "word-to-pdf",
    name: "Word to PDF",
    description: "Make DOC and DOCX files easy to read by converting them to PDF.",
    title: "Convert WORD to PDF",
    subtitle: "Make DOC and DOCX files easy to read by converting them to PDF.",
    category: "convert",
    icon: "file-import",
    badge: "W",
    color: "#2b5797",
    accept: ".doc,.docx,.odt,.rtf,.txt",
    acceptLabel: "WORD documents",
    multiple: true,
    action: "Convert to PDF",
  },
  {
    slug: "powerpoint-to-pdf",
    name: "PowerPoint to PDF",
    description: "Make PPT and PPTX slideshows easy to view by converting them to PDF.",
    title: "Convert POWERPOINT to PDF",
    subtitle: "Make PPT and PPTX slideshows easy to view by converting them to PDF.",
    category: "convert",
    icon: "file-import",
    badge: "P",
    color: "#d24726",
    accept: ".ppt,.pptx,.odp,.pps,.ppsx",
    acceptLabel: "POWERPOINT files",
    multiple: true,
    action: "Convert to PDF",
  },
  {
    slug: "excel-to-pdf",
    name: "Excel to PDF",
    description: "Make EXCEL spreadsheets easy to read by converting them to PDF.",
    title: "Convert EXCEL to PDF",
    subtitle: "Make EXCEL spreadsheets easy to read by converting them to PDF.",
    category: "convert",
    icon: "file-import",
    badge: "X",
    color: "#1e7145",
    accept: ".xls,.xlsx,.ods,.csv",
    acceptLabel: "EXCEL files",
    multiple: true,
    action: "Convert to PDF",
  },
  {
    slug: "edit-pdf",
    name: "Edit PDF",
    description: "Add text, images, shapes or freehand annotations to a PDF document. Edit the size, font, and color of the added content.",
    title: "Edit PDF",
    subtitle: "Add text, images, shapes or freehand annotations to your PDF.",
    category: "edit",
    icon: "edit",
    color: "#8e44ad",
    accept: PDF,
    acceptLabel: "PDF file",
    multiple: false,
    action: "Save changes",
    editor: "edit",
  },
  {
    slug: "pdf-to-jpg",
    name: "PDF to JPG",
    description: "Convert each PDF page into a JPG or extract all images contained in a PDF.",
    title: "PDF to JPG",
    subtitle: "Convert each PDF page into a JPG or extract all images contained in a PDF.",
    category: "convert",
    icon: "photo-down",
    color: "#f1b800",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    action: "Convert to JPG",
    options: [
      {
        type: "choice",
        key: "mode",
        label: "Mode",
        default: "pages",
        choices: [
          { value: "pages", label: "Page to JPG", hint: "Every page becomes a JPG" },
          { value: "extract", label: "Extract images", hint: "Pull out embedded images" },
        ],
      },
      {
        type: "choice",
        key: "quality",
        label: "Image quality",
        default: "normal",
        showIf: { key: "mode", equals: "pages" },
        choices: [
          { value: "normal", label: "Normal", hint: "150 DPI" },
          { value: "high", label: "High", hint: "300 DPI" },
        ],
      },
    ],
  },
  {
    slug: "jpg-to-pdf",
    name: "JPG to PDF",
    description: "Convert JPG images to PDF in seconds. Easily adjust orientation and margins.",
    title: "JPG to PDF",
    subtitle: "Convert JPG images to PDF in seconds. Easily adjust orientation and margins.",
    category: "convert",
    icon: "photo-up",
    color: "#f1b800",
    accept: ".jpg,.jpeg,.png,.webp,.gif,.bmp,image/*",
    acceptLabel: "JPG images",
    multiple: true,
    action: "Convert to PDF",
    options: [
      {
        type: "choice",
        key: "orientation",
        label: "Page orientation",
        default: "portrait",
        choices: [
          { value: "portrait", label: "Portrait" },
          { value: "landscape", label: "Landscape" },
        ],
      },
      {
        type: "choice",
        key: "size",
        label: "Page size",
        default: "fit",
        choices: [
          { value: "fit", label: "Fit (same page size as image)" },
          { value: "a4", label: "A4 (297x210 mm)" },
          { value: "letter", label: "US Letter (215x279.4 mm)" },
        ],
      },
      {
        type: "choice",
        key: "margin",
        label: "Margin",
        default: "none",
        choices: [
          { value: "none", label: "No margin" },
          { value: "small", label: "Small" },
          { value: "big", label: "Big" },
        ],
      },
      { type: "checkbox", key: "merge", label: "Merge all images in one PDF file", default: true },
    ],
  },
  {
    slug: "sign-pdf",
    name: "Sign PDF",
    description: "Sign yourself or request electronic signatures from others.",
    title: "Sign PDF",
    subtitle: "Sign a document yourself or send a signature request to others.",
    category: "security",
    icon: "signature",
    color: "#2d7ff9",
    accept: PDF,
    acceptLabel: "PDF file",
    multiple: false,
    action: "Sign",
    editor: "sign",
  },
  {
    slug: "add-watermark",
    name: "Watermark",
    description: "Stamp an image or text over your PDF in seconds. Choose the typography, transparency and position.",
    title: "Add watermark into a PDF",
    subtitle: "Stamp an image or text over your PDF in seconds.",
    category: "edit",
    icon: "droplet-half-2",
    color: "#8e44ad",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    action: "Add watermark",
    options: [
      {
        type: "choice",
        key: "kind",
        label: "Watermark type",
        default: "text",
        choices: [
          { value: "text", label: "Place text" },
          { value: "image", label: "Place image" },
        ],
      },
      { type: "text", key: "text", label: "Text", default: "Workify", showIf: { key: "kind", equals: "text" } },
      { type: "number", key: "fontSize", label: "Font size", default: 48, min: 6, max: 300, showIf: { key: "kind", equals: "text" } },
      {
        type: "choice",
        key: "font",
        label: "Font",
        default: "Helvetica",
        showIf: { key: "kind", equals: "text" },
        choices: [
          { value: "Helvetica", label: "Helvetica" },
          { value: "TimesRoman", label: "Times" },
          { value: "Courier", label: "Courier" },
        ],
      },
      { type: "checkbox", key: "bold", label: "Bold", default: true, showIf: { key: "kind", equals: "text" } },
      { type: "color", key: "color", label: "Color", default: "#e5322d", showIf: { key: "kind", equals: "text" } },
      { type: "file", key: "image", label: "Image", accept: ".png,.jpg,.jpeg", showIf: { key: "kind", equals: "image" } },
      { type: "position", key: "position", label: "Position", default: "mc" },
      { type: "checkbox", key: "mosaic", label: "Mosaic (repeat across the page)", default: false },
      {
        type: "choice",
        key: "opacity",
        label: "Transparency",
        default: "0.5",
        choices: [
          { value: "1", label: "No transparency" },
          { value: "0.75", label: "25%" },
          { value: "0.5", label: "50%" },
          { value: "0.25", label: "75%" },
        ],
      },
      {
        type: "choice",
        key: "rotation",
        label: "Rotation",
        default: "0",
        choices: [
          { value: "0", label: "Do not rotate" },
          { value: "45", label: "45 degrees" },
          { value: "90", label: "90 degrees" },
          { value: "180", label: "180 degrees" },
          { value: "270", label: "270 degrees" },
        ],
      },
      {
        type: "choice",
        key: "layer",
        label: "Layer",
        default: "over",
        choices: [
          { value: "over", label: "Over the PDF content" },
          { value: "below", label: "Below the PDF content" },
        ],
      },
      { type: "text", key: "pages", label: "Pages", default: "all", placeholder: "all or 1-3, 5" },
    ],
  },
  {
    slug: "rotate-pdf",
    name: "Rotate PDF",
    description: "Rotate your PDFs the way you need them. You can even rotate multiple PDFs at once!",
    title: "Rotate PDF",
    subtitle: "Rotate your PDFs the way you need them. You can even rotate multiple PDFs at once!",
    category: "edit",
    icon: "rotate-clockwise",
    color: "#8e44ad",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    action: "Rotate PDF",
    editor: "rotate",
  },
  {
    slug: "html-to-pdf",
    name: "HTML to PDF",
    description: "Convert webpages in HTML to PDF. Copy and paste the URL of the page you want and convert it to PDF with a click.",
    title: "HTML to PDF",
    subtitle: "Convert web pages to PDF documents with high accuracy.",
    category: "convert",
    icon: "world-www",
    color: "#f1b800",
    accept: "",
    acceptLabel: "",
    multiple: false,
    action: "Convert to PDF",
    editor: "html",
  },
  {
    slug: "unlock-pdf",
    name: "Unlock PDF",
    description: "Remove PDF password security, giving you the freedom to use your PDFs as you want.",
    title: "Unlock PDF",
    subtitle: "Remove PDF password security, giving you the freedom to use your PDFs as you want.",
    category: "security",
    icon: "lock-open",
    color: "#2d7ff9",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    action: "Unlock PDF",
    options: [
      {
        type: "password",
        key: "password",
        label: "Password (if the PDF needs one to open)",
        default: "",
        placeholder: "Leave empty for permission-only locks",
      },
    ],
  },
  {
    slug: "protect-pdf",
    name: "Protect PDF",
    description: "Protect PDF files with a password. Encrypt PDF documents to prevent unauthorized access.",
    title: "Protect PDF file",
    subtitle: "Encrypt your PDF with a password to keep sensitive data confidential.",
    category: "security",
    icon: "lock",
    color: "#2d7ff9",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    action: "Protect PDF",
    options: [
      { type: "password", key: "password", label: "Type password", default: "", required: true },
      { type: "password", key: "repeat", label: "Repeat password", default: "", required: true },
    ],
  },
  {
    slug: "organize-pdf",
    name: "Organize PDF",
    description: "Sort pages of your PDF file however you like. Delete PDF pages or add PDF pages to your document at your convenience.",
    title: "Organize PDF",
    subtitle: "Sort, add and delete PDF pages. Drag and drop the page thumbnails and sort them in our PDF organizer.",
    category: "organize",
    icon: "layout-grid",
    color: "#e5322d",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    action: "Organize",
    editor: "organize",
  },
  {
    slug: "pdf-to-pdfa",
    name: "PDF to PDF/A",
    description: "Transform your PDF to PDF/A, the ISO-standardized version of PDF for long-term archiving. Your PDF will preserve formatting when accessed in the future.",
    title: "PDF to PDF/A",
    subtitle: "Transform your PDF to PDF/A, the ISO-standardized version of PDF for long-term archiving.",
    category: "convert",
    icon: "archive",
    color: "#2b5797",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    action: "Convert to PDF/A",
    options: [
      {
        type: "choice",
        key: "conformance",
        label: "PDF/A conformance level",
        default: "2",
        choices: [
          { value: "1", label: "PDF/A-1b", hint: "Strictest, oldest standard" },
          { value: "2", label: "PDF/A-2b", hint: "Recommended" },
          { value: "3", label: "PDF/A-3b", hint: "Allows embedded files" },
        ],
      },
    ],
  },
  {
    slug: "repair-pdf",
    name: "Repair PDF",
    description: "Repair a damaged PDF and recover data from corrupt PDF. Fix PDF files with our Repair tool.",
    title: "Repair PDF",
    subtitle: "Repair a damaged PDF and recover data from corrupt PDF.",
    category: "optimize",
    icon: "tool",
    color: "#6aa84f",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    action: "Repair PDF",
  },
  {
    slug: "add-page-numbers",
    name: "Page numbers",
    description: "Add page numbers into PDFs with ease. Choose your positions, dimensions, typography.",
    title: "Add page numbers",
    subtitle: "Add page numbers into PDFs with ease. Choose your positions, dimensions, typography.",
    category: "edit",
    icon: "list-numbers",
    color: "#8e44ad",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    action: "Add page numbers",
    options: [
      {
        type: "choice",
        key: "pageMode",
        label: "Page mode",
        default: "single",
        choices: [
          { value: "single", label: "Single page" },
          { value: "facing", label: "Facing pages", hint: "Mirror position on even pages" },
        ],
      },
      { type: "position", key: "position", label: "Position", default: "bc" },
      {
        type: "choice",
        key: "margin",
        label: "Margin",
        default: "recommended",
        choices: [
          { value: "small", label: "Small" },
          { value: "recommended", label: "Recommended" },
          { value: "big", label: "Big" },
        ],
      },
      { type: "number", key: "firstNumber", label: "First number", default: 1, min: 0 },
      { type: "number", key: "fromPage", label: "From page", default: 1, min: 1 },
      { type: "number", key: "toPage", label: "To page (0 = last)", default: 0, min: 0 },
      {
        type: "choice",
        key: "format",
        label: "Text",
        default: "{n}",
        choices: [
          { value: "{n}", label: "Insert only page number (recommended)" },
          { value: "Page {n}", label: "Page {n}" },
          { value: "Page {n} of {p}", label: "Page {n} of {p}" },
          { value: "custom", label: "Custom" },
        ],
      },
      {
        type: "text",
        key: "customFormat",
        label: "Custom text",
        default: "{n} / {p}",
        hint: "{n} = page number, {p} = total pages",
        showIf: { key: "format", equals: "custom" },
      },
      { type: "number", key: "fontSize", label: "Font size", default: 12, min: 6, max: 72 },
      {
        type: "choice",
        key: "font",
        label: "Font",
        default: "Helvetica",
        choices: [
          { value: "Helvetica", label: "Helvetica" },
          { value: "TimesRoman", label: "Times" },
          { value: "Courier", label: "Courier" },
        ],
      },
      { type: "color", key: "color", label: "Color", default: "#000000" },
    ],
  },
  {
    slug: "scan-to-pdf",
    name: "Scan to PDF",
    description: "Capture document scans from your mobile device and send them instantly to your browser.",
    title: "Scan to PDF",
    subtitle: "Capture document scans with your camera and turn them into a PDF.",
    category: "organize",
    icon: "scan",
    color: "#e5322d",
    accept: "image/*",
    acceptLabel: "Photos",
    multiple: true,
    action: "Create PDF",
    editor: "scan",
  },
  {
    slug: "ocr-pdf",
    name: "OCR PDF",
    description: "Easily convert scanned PDF into searchable and selectable documents.",
    title: "OCR PDF",
    subtitle: "Easily convert scanned PDF into searchable and selectable documents.",
    category: "optimize",
    icon: "text-recognition",
    color: "#6aa84f",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    action: "OCR PDF",
    options: [
      {
        type: "choice",
        key: "language",
        label: "Document language",
        default: "eng",
        choices: [{ value: "eng", label: "English" }],
      },
    ],
  },
  {
    slug: "compare-pdf",
    name: "Compare PDF",
    description: "Show a side-by-side document comparison and easily spot changes between different file versions.",
    title: "Compare PDF",
    subtitle: "Easily display the differences between two similar files.",
    category: "security",
    icon: "git-compare",
    color: "#2d7ff9",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    minFiles: 2,
    action: "Compare",
    editor: "compare",
    isNew: true,
  },
  {
    slug: "redact-pdf",
    name: "Redact PDF",
    description: "Redact text and graphics to permanently remove sensitive information from a PDF.",
    title: "Redact PDF",
    subtitle: "Permanently remove sensitive text and graphics from your PDF.",
    category: "security",
    icon: "eye-off",
    color: "#2d7ff9",
    accept: PDF,
    acceptLabel: "PDF file",
    multiple: false,
    action: "Redact",
    editor: "redact",
    isNew: true,
  },
  {
    slug: "crop-pdf",
    name: "Crop PDF",
    description: "Crop margins of PDF documents or select specific areas, then apply the changes to one page or the whole document.",
    title: "Crop PDF",
    subtitle: "Crop margins or select an area, then apply it to one page or the whole document.",
    category: "edit",
    icon: "crop",
    color: "#8e44ad",
    accept: PDF,
    acceptLabel: "PDF file",
    multiple: false,
    action: "Crop PDF",
    editor: "crop",
    isNew: true,
  },
  {
    slug: "pdf-forms",
    name: "PDF Forms",
    description: "Detect form fields automatically, create interactive fillable PDFs, or fill PDF forms yourself. Add text fields, checkboxes, and more.",
    title: "PDF Forms",
    subtitle: "Detect, create and fill form fields in your PDF.",
    category: "edit",
    icon: "forms",
    color: "#8e44ad",
    accept: PDF,
    acceptLabel: "PDF file",
    multiple: false,
    action: "Save form",
    editor: "forms",
    isNew: true,
  },
  {
    slug: "ai-summarizer",
    name: "AI Summarizer",
    description: "Quickly generate concise summaries from articles, paragraphs, and essays, providing clear and precise insights.",
    title: "AI Summarizer",
    subtitle: "Generate concise summaries of your PDF documents.",
    category: "intelligence",
    icon: "sparkles",
    color: "#7c4dff",
    accept: PDF,
    acceptLabel: "PDF file",
    multiple: false,
    action: "Summarize",
    unavailable: "AI Summarizer is temporarily unavailable. Please check back soon.",
    isNew: true,
  },
  {
    slug: "translate-pdf",
    name: "Translate PDF",
    description: "Easily translate PDF files powered by AI. Keep fonts, layout, and formatting perfectly intact.",
    title: "Translate PDF",
    subtitle: "Translate your PDF documents while keeping the layout intact.",
    category: "intelligence",
    icon: "language",
    color: "#7c4dff",
    accept: PDF,
    acceptLabel: "PDF file",
    multiple: false,
    action: "Translate",
    unavailable: "Translate PDF is temporarily unavailable. Please check back soon.",
    isNew: true,
  },
  {
    slug: "pdf-to-markdown",
    name: "PDF to Markdown",
    description: "Easily turn PDFs into Markdown files. Perfect for notes, docs, and LLMs. Headings, tables, lists and more are preserved.",
    title: "PDF to Markdown",
    subtitle: "Turn PDFs into clean Markdown, keeping headings, tables and lists.",
    category: "convert",
    icon: "markdown",
    color: "#33333b",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    action: "Convert to Markdown",
    isNew: true,
  },
  {
    slug: "create-workflow",
    name: "Create a workflow",
    description: "Create custom workflows with your favorite tools, automate tasks, and reuse them anytime.",
    title: "Create a workflow",
    subtitle: "Chain your favorite tools, run them in one go, and reuse the workflow anytime.",
    category: "workflows",
    icon: "route",
    color: "#e5322d",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    action: "Run workflow",
    editor: "workflow",
  },
];

export const TOOL_BY_SLUG = new Map(TOOLS.map((t) => [t.slug, t]));

/** Tools that turn one PDF into one PDF, so they can be chained in a workflow. */
export const WORKFLOW_STEPS = [
  "compress-pdf",
  "repair-pdf",
  "ocr-pdf",
  "pdf-to-pdfa",
  "add-watermark",
  "add-page-numbers",
  "rotate-pdf",
  "protect-pdf",
  "unlock-pdf",
] as const;

/** Options shown for a tool when it is a workflow step (no file inputs, rotate gets an angle). */
export function workflowStepOptions(slug: string): ToolOption[] {
  if (slug === "rotate-pdf") {
    return [
      {
        type: "choice",
        key: "angle",
        label: "Rotate",
        default: "90",
        choices: [
          { value: "90", label: "90° clockwise" },
          { value: "180", label: "180°" },
          { value: "270", label: "90° counter-clockwise" },
        ],
      },
    ];
  }
  const opts = TOOL_BY_SLUG.get(slug)?.options ?? [];
  if (slug === "add-watermark") {
    // Image watermarks need an upload, so workflows support text watermarks only.
    return opts.filter((o) => o.key !== "kind" && o.type !== "file").map((o) => ({ ...o, showIf: undefined }) as ToolOption);
  }
  return opts.filter((o) => o.type !== "file");
}

/** Header "Convert PDF" dropdown groups. */
export const CONVERT_MENU = {
  "Convert to PDF": ["jpg-to-pdf", "word-to-pdf", "powerpoint-to-pdf", "excel-to-pdf", "html-to-pdf"],
  "Convert from PDF": ["pdf-to-jpg", "pdf-to-word", "pdf-to-powerpoint", "pdf-to-excel", "pdf-to-pdfa", "pdf-to-markdown"],
};

/** Header "All PDF tools" mega menu groups. */
export const ALL_TOOLS_MENU: Record<string, string[]> = {
  "Organize PDF": ["merge-pdf", "split-pdf", "organize-pdf", "scan-to-pdf"],
  "Optimize PDF": ["compress-pdf", "repair-pdf", "ocr-pdf"],
  "Convert to PDF": CONVERT_MENU["Convert to PDF"],
  "Convert from PDF": CONVERT_MENU["Convert from PDF"],
  "Edit PDF": ["rotate-pdf", "add-page-numbers", "add-watermark", "crop-pdf", "edit-pdf", "pdf-forms"],
  "PDF Security": ["unlock-pdf", "protect-pdf", "sign-pdf", "redact-pdf", "compare-pdf"],
  "PDF Intelligence": ["ai-summarizer", "translate-pdf"],
};

export function optionVisible(opt: ToolOption, values: Record<string, unknown>) {
  if (!opt.showIf) return true;
  const v = String(values[opt.showIf.key]);
  return Array.isArray(opt.showIf.equals) ? opt.showIf.equals.includes(v) : v === opt.showIf.equals;
}
