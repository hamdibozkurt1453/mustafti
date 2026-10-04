/**
 * فهرسة «بيّنات: أسئلة وأجوبة عن الإسلام» (dawa.center/file/7937) في جدول bayyinat.
 *
 * رابط تنزيل الملف ممنوع على الزواحف في robots.txt، فلا تنزيل آلي: ينزّله حمدي يدوياً
 * من المتصفح، ويضعه **خارج المستودع** (أو في private-data/ المستثنى في .gitignore).
 * الملف نفسه لا يُرفع إلى GitHub أبداً؛ يُحفظ في القاعدة السؤال والجواب ورقمهما ورابط المصدر.
 *
 * قبل التشغيل: نفّذ supabase/bayyinat.sql في Supabase، وضع في .env.local
 * NEXT_PUBLIC_SUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY.
 *
 *   npm run index-bayyinat -- --file ../mustafti-data/bayyinat.pdf          # تجربة: يطبع ما استخرجه فقط
 *   npm run index-bayyinat -- --file ../mustafti-data/bayyinat.pdf --write  # يكتب في Supabase
 *
 * يقبل PDF أو نصاً (.txt) إن صُدّر الملف نصاً. التجربة (بلا --write) تطبع عدد الأسئلة
 * وأول خمسة منها وأي ثغرات في الترقيم، لتُراجع قبل الكتابة.
 */
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const SOURCE_URL = "https://dawa.center/file/7937";

type Entry = { number: number; question: string; answer: string; page: number | null };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

/** صفحات النص: من PDF بـ unpdf، أو من ملف نصي (صفحة واحدة). */
async function readPages(file: string): Promise<string[]> {
  const buffer = readFileSync(file);
  if (extname(file).toLowerCase() === ".pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: false });
    return text as string[];
  }
  return [buffer.toString("utf8")];
}

/** توحيد النص العربي المستخرج: أشكال العرض (ﻻ ﷺ…) إلى الحروف القياسية، والمسافات. */
function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/ـ/g, "") // التطويل
    .replace(/[ \t ]+/g, " ")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

// بداية سؤال: «س12:» أو «سؤال 12:» أو «السؤال (12)» أو «12- … ؟».
const QUESTION_MARKED = /^\s*(?:س|سؤال|السؤال)\s*[([]?\s*(\d{1,4})\s*[)\]]?\s*[:：.\-–]?\s*(.*)$/;
const QUESTION_NUMBERED = /^\s*(\d{1,4})\s*[-.)–]\s*(.+)$/;
// بداية جواب: «ج:» أو «الجواب:».
const ANSWER = /^\s*(?:ج|الجواب|جواب)\s*[:：.\-–]\s*(.*)$/;

/**
 * يقسم النص إلى أسئلة وأجوبة. السؤال المرقّم بلا علامة «س» يُقبل فقط إن انتهى بعلامة استفهام
 * خلال ثلاثة أسطر، حتى لا تُحسب القوائم المرقمة داخل الأجوبة أسئلة.
 */
export function parseBayyinat(pages: string[]): Entry[] {
  const lines: { text: string; page: number }[] = [];
  pages.forEach((p, i) =>
    normalize(p)
      .split(/\r?\n/)
      .map((t) => t.trim())
      .filter(Boolean)
      .forEach((text) => lines.push({ text, page: i + 1 })),
  );

  const entries: Entry[] = [];
  let current: { number: number; q: string[]; a: string[]; inAnswer: boolean; page: number } | null = null;
  const flush = () => {
    if (current && current.q.length && current.a.length) {
      entries.push({
        number: current.number,
        question: current.q.join(" ").trim(),
        answer: current.a.join("\n").trim(),
        page: current.page,
      });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const { text, page } = lines[i];
    const marked = text.match(QUESTION_MARKED);
    let numbered = !marked ? text.match(QUESTION_NUMBERED) : null;
    if (numbered) {
      const window: string[] = [];
      for (const l of lines.slice(i, i + 3)) {
        if (window.length && QUESTION_MARKED.test(l.text)) break; // لا نعبر إلى سؤال معلَّم
        window.push(l.text);
      }
      const n = Number(numbered[1]);
      const expected = current ? current.number + 1 : 1;
      if (!/[؟?]/.test(window.join(" ")) || n !== expected) numbered = null;
    }
    const start = marked ?? numbered;
    if (start) {
      flush();
      current = { number: Number(start[1]), q: start[2] ? [start[2]] : [], a: [], inAnswer: false, page };
      continue;
    }
    if (!current) continue;
    const answer = text.match(ANSWER);
    if (answer) {
      current.inAnswer = true;
      if (answer[1]) current.a.push(answer[1]);
    } else if (!current.inAnswer) {
      current.q.push(text);
      // بلا علامة «ج»: الجواب يبدأ بعد السطر الذي ينتهي باستفهام.
      if (/[؟?]\s*$/.test(text)) current.inAnswer = true;
    } else {
      current.a.push(text);
    }
  }
  flush();

  // رقم مكرر (فهرس في أول الكتاب مثلاً): نبقي المدخل ذا الجواب الأطول.
  const byNumber = new Map<number, Entry>();
  for (const e of entries) {
    const prev = byNumber.get(e.number);
    if (!prev || e.answer.length > prev.answer.length) byNumber.set(e.number, e);
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

async function main() {
  const file = arg("file") ?? process.env.BAYYINAT_FILE;
  if (!file) {
    console.error("حدد مسار الملف: --file <path> (خارج المستودع، أو داخل private-data/).");
    process.exit(1);
  }
  const path = resolve(file);
  const pages = await readPages(path);
  const entries = parseBayyinat(pages);

  const numbers = entries.map((e) => e.number);
  const gaps: number[] = [];
  for (let n = 1; n <= Math.max(0, ...numbers); n++) if (!numbers.includes(n)) gaps.push(n);

  console.log(`الصفحات: ${pages.length} · الأسئلة المستخرجة: ${entries.length}`);
  console.log(`أرقام ناقصة (${gaps.length}): ${gaps.slice(0, 40).join("، ")}${gaps.length > 40 ? "…" : ""}`);
  for (const e of entries.slice(0, 5)) {
    console.log(`\n— ${e.number} (ص ${e.page}) ${e.question}\n  ${e.answer.slice(0, 240).replace(/\n/g, " ")}…`);
  }

  if (!process.argv.includes("--write")) {
    console.log("\nتجربة فقط. راجع الناتج، ثم أعد التشغيل مع --write للكتابة في Supabase.");
    return;
  }
  if (!entries.length) {
    console.error("لا أسئلة مستخرجة؛ لا كتابة.");
    process.exit(1);
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const db = createAdminClient();
  for (let i = 0; i < entries.length; i += 200) {
    const batch = entries.slice(i, i + 200).map((e) => ({ ...e, source_url: SOURCE_URL, lang: "ar" }));
    const { error } = await db.from("bayyinat").upsert(batch, { onConflict: "number" });
    if (error) {
      console.error(`فشلت الكتابة عند الدفعة ${i / 200 + 1}: ${error.message}`);
      process.exit(1);
    }
  }
  console.log(`\nكُتب ${entries.length} سؤالاً في جدول bayyinat.`);
}

if (process.argv[1]?.includes("index-bayyinat")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
