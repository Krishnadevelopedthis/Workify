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
  | {
      /** Several values joined with "+", e.g. "eng+hin". */
      type: "multi";
      key: string;
      label: string;
      default: string;
      max: number;
      choices: { value: string; label: string }[];
      showIf?: ShowIf;
    }
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
    | "pages"
    | "workflow";
  unavailable?: string;
  isNew?: boolean;
};

const PDF = ".pdf,application/pdf";

/** Tesseract language codes offered by OCR PDF (code, label). */
export const OCR_LANGUAGES: [string, string][] = [
  ["eng", "English"],
  ["hin", "Hindi"],
  ["mar", "Marathi"],
  ["ben", "Bengali"],
  ["guj", "Gujarati"],
  ["pan", "Punjabi"],
  ["tam", "Tamil"],
  ["tel", "Telugu"],
  ["kan", "Kannada"],
  ["mal", "Malayalam"],
  ["urd", "Urdu"],
  ["ori", "Odia"],
  ["asm", "Assamese"],
  ["nep", "Nepali"],
  ["san", "Sanskrit"],
  ["spa", "Spanish"],
  ["fra", "French"],
  ["deu", "German"],
  ["ita", "Italian"],
  ["por", "Portuguese"],
  ["nld", "Dutch"],
  ["rus", "Russian"],
  ["ukr", "Ukrainian"],
  ["pol", "Polish"],
  ["tur", "Turkish"],
  ["ara", "Arabic"],
  ["fas", "Persian"],
  ["chi_sim", "Chinese (Simplified)"],
  ["chi_tra", "Chinese (Traditional)"],
  ["jpn", "Japanese"],
  ["kor", "Korean"],
  ["vie", "Vietnamese"],
  ["ind", "Indonesian"],
  ["tha", "Thai"],
];
const POSITIONS = "tl,tc,tr,ml,mc,mr,bl,bc,br";
export const POSITION_VALUES = POSITIONS.split(",");

/** Offered by PDF to Word / PowerPoint / Excel for scanned documents. */
const OCR_CONVERT_OPTIONS: ToolOption[] = [
  { type: "checkbox", key: "ocr", label: "Scanned PDF: recognize the text (OCR)", default: false },
  {
    type: "multi",
    key: "language",
    label: "Document languages (up to 5)",
    default: "eng",
    max: 5,
    choices: OCR_LANGUAGES.map(([value, label]) => ({ value, label })),
    showIf: { key: "ocr", equals: "true" },
  },
];

export const TOOLS: Tool[] = [
  {
    slug: "merge-pdf",
    name: "Merge PDF",
    description: "Join several PDFs into a single document and put the pages in exactly the order you need.",
    title: "Merge PDF files",
    subtitle: "Put several PDFs together into one file, in any order you choose.",
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
    description: "Break a PDF into smaller files by page ranges, fixed intervals, selected pages or file size.",
    title: "Split PDF",
    subtitle: "Turn one PDF into several smaller files, by range, by interval or by size.",
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
    slug: "remove-pages",
    name: "Remove pages",
    description: "Delete the pages you don't need and download a cleaner, shorter PDF.",
    title: "Remove PDF pages",
    subtitle: "Click the pages to delete, or type their numbers, and get a PDF without them.",
    category: "organize",
    icon: "file-minus",
    color: "#e5322d",
    accept: PDF,
    acceptLabel: "PDF file",
    multiple: false,
    action: "Remove pages",
    editor: "pages",
    isNew: true,
    options: [{ type: "text", key: "pages", label: "Pages to remove", default: "", placeholder: "2, 5-7", required: true }],
  },
  {
    slug: "extract-pages",
    name: "Extract pages",
    description: "Pull selected pages out of a PDF into a new file, or save each page on its own.",
    title: "Extract PDF pages",
    subtitle: "Choose the pages you want and save them as a new PDF.",
    category: "organize",
    icon: "file-symlink",
    color: "#e5322d",
    accept: PDF,
    acceptLabel: "PDF file",
    multiple: false,
    action: "Extract pages",
    editor: "pages",
    isNew: true,
    options: [
      { type: "text", key: "pages", label: "Pages to extract", default: "", placeholder: "1, 3-4", required: true },
      { type: "checkbox", key: "separate", label: "Save each page as a separate PDF", default: false },
    ],
  },
  {
    slug: "compress-pdf",
    name: "Compress PDF",
    description: "Shrink PDF files for email and uploads while keeping text sharp and images clear.",
    title: "Compress PDF",
    subtitle: "Make PDFs smaller for email and uploads, with the quality level you choose.",
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
    description: "Turn PDFs into editable Word documents that keep paragraphs, tables and images in place. Works with scanned files too.",
    title: "PDF to Word",
    subtitle: "Get an editable DOCX from any PDF, including scanned documents.",
    category: "convert",
    icon: "file-export",
    badge: "W",
    color: "#2b5797",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    action: "Convert to WORD",
    options: OCR_CONVERT_OPTIONS,
  },
  {
    slug: "pdf-to-powerpoint",
    name: "PDF to PowerPoint",
    description: "Turn every PDF page into an editable PowerPoint slide with real text boxes and images.",
    title: "PDF to PowerPoint",
    subtitle: "Get editable PPTX slides from your PDF pages.",
    category: "convert",
    icon: "file-export",
    badge: "P",
    color: "#d24726",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    action: "Convert to PPTX",
    options: OCR_CONVERT_OPTIONS,
  },
  {
    slug: "pdf-to-excel",
    name: "PDF to Excel",
    description: "Move tables from PDFs into Excel sheets, ready to sort, filter and calculate.",
    title: "PDF to Excel",
    subtitle: "Get the tables in your PDF as an editable XLSX workbook.",
    category: "convert",
    icon: "file-export",
    badge: "X",
    color: "#1e7145",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    action: "Convert to EXCEL",
    options: OCR_CONVERT_OPTIONS,
  },
  {
    slug: "word-to-pdf",
    name: "Word to PDF",
    description: "Turn DOC, DOCX, ODT and RTF documents into PDFs that look the same on every device.",
    title: "Word to PDF",
    subtitle: "Create a PDF from your Word document in seconds.",
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
    description: "Turn PPT and PPTX presentations into PDFs that are easy to share and print.",
    title: "PowerPoint to PDF",
    subtitle: "Create a PDF from your slides, one page per slide.",
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
    description: "Turn XLS, XLSX and CSV spreadsheets into neat, printable PDF pages.",
    title: "Excel to PDF",
    subtitle: "Create a PDF from your spreadsheet in seconds.",
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
    description: "Write on a PDF: add text, pictures, shapes and freehand drawings, then adjust font, size and color.",
    title: "Edit PDF",
    subtitle: "Add text, pictures, shapes and drawings to any page.",
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
    description: "Save each PDF page as a JPG picture, or pull out every image embedded in the file.",
    title: "PDF to JPG",
    subtitle: "Get every page as a JPG, or extract the images inside the PDF.",
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
    description: "Put photos and images into a PDF, with the page size, orientation and margins you want.",
    title: "JPG to PDF",
    subtitle: "Create a PDF from JPG, PNG and other images.",
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
    description: "Sign documents yourself or send them to several people to sign, with email invites and an audit trail.",
    title: "Sign PDF",
    subtitle: "Add your signature, or collect signatures from others.",
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
    description: "Stamp text or a logo on your PDF pages, with full control over font, transparency, angle and position.",
    title: "Add a watermark",
    subtitle: "Put a text or image stamp on your PDF pages.",
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
    description: "Turn pages that are sideways or upside down, in one PDF or many at once.",
    title: "Rotate PDF",
    subtitle: "Fix the orientation of your PDF pages, one file or many.",
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
    description: "Save any web page as a PDF: paste a link and choose the page size and margins.",
    title: "HTML to PDF",
    subtitle: "Turn a web page into a PDF from its address.",
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
    description: "Remove the password and restrictions from a PDF you're allowed to open, so you can edit and print it freely.",
    title: "Unlock PDF",
    subtitle: "Take the password and restrictions off your PDF.",
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
    description: "Lock a PDF with a password using strong 256-bit AES encryption.",
    title: "Protect PDF",
    subtitle: "Add a password so only the people you choose can open the file.",
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
    description: "Reorder, rotate, delete and add pages, and combine pages from several PDFs, all by drag and drop.",
    title: "Organize PDF",
    subtitle: "Drag pages into the order you want, rotate or delete them, and add blank pages.",
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
    description: "Convert PDFs to PDF/A, the ISO standard for documents that must stay readable for decades.",
    title: "PDF to PDF/A",
    subtitle: "Make your PDF ready for long-term archiving.",
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
    description: "Rebuild PDFs that won't open or show errors, and recover as much content as possible.",
    title: "Repair PDF",
    subtitle: "Fix a damaged PDF and get its content back.",
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
    description: "Number the pages of your PDF, with the position, style, font and starting number you want.",
    title: "Add page numbers",
    subtitle: "Add page numbers in the style and position you choose.",
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
    description: "Photograph paper documents with your phone or webcam and turn them into one clean PDF.",
    title: "Scan to PDF",
    subtitle: "Use your camera to create a PDF from paper documents.",
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
    description: "Recognize the text in scanned PDFs in 34 languages, so you can search, select and copy it.",
    title: "OCR PDF",
    subtitle: "Make scanned PDFs searchable and selectable.",
    category: "optimize",
    icon: "text-recognition",
    color: "#6aa84f",
    accept: PDF,
    acceptLabel: "PDF files",
    multiple: true,
    action: "OCR PDF",
    options: [
      {
        type: "multi",
        key: "language",
        label: "Document languages (up to 5)",
        default: "eng",
        max: 5,
        choices: OCR_LANGUAGES.map(([value, label]) => ({ value, label })),
      },
    ],
  },
  {
    slug: "compare-pdf",
    name: "Compare PDF",
    description: "Put two versions of a document side by side and see every added and removed word highlighted.",
    title: "Compare PDF",
    subtitle: "See exactly what changed between two versions of a PDF.",
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
    description: "Black out names, numbers and other private details for good, by drawing boxes or searching for text.",
    title: "Redact PDF",
    subtitle: "Remove private text and images from your PDF permanently.",
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
    description: "Trim margins or keep just the area you need, on one page or the whole document.",
    title: "Crop PDF",
    subtitle: "Cut away margins or keep only part of a page.",
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
    description: "Find form fields automatically, add your own text boxes and checkboxes, or fill in an existing form.",
    title: "PDF Forms",
    subtitle: "Create fillable forms, or fill one in.",
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
    description: "Get the key points of a long document in a short, readable summary.",
    title: "AI Summarizer",
    subtitle: "Get a short summary of your PDF.",
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
    description: "Translate a PDF into another language while keeping its layout.",
    title: "Translate PDF",
    subtitle: "Translate your PDF and keep its layout.",
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
    description: "Turn PDFs into clean Markdown with headings, lists and tables, ready for notes, docs and AI tools.",
    title: "PDF to Markdown",
    subtitle: "Get the content of your PDF as Markdown.",
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
    description: "Chain several tools into one workflow, run it on many files at once and save it for next time.",
    title: "Create a workflow",
    subtitle: "Run several tools in a row, and save the steps to reuse.",
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
  "remove-pages",
  "extract-pages",
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
  "Organize PDF": ["merge-pdf", "split-pdf", "remove-pages", "extract-pages", "organize-pdf", "scan-to-pdf"],
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
