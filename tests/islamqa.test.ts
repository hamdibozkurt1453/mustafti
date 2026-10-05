/**
 * «الإسلام سؤال وجواب» محلياً (R1d): migration الجدول والبحث على Postgres في الذاكرة (PGlite مع
 * pg_trgm)، وتحويل صفوف Hugging Face، والمقتطف الحرفي الذي يقتطعه الكود، والرابط بلغة السائل.
 *   npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

import { bestParagraphs, paragraphs } from "../lib/brain/excerpt";
import { keywords } from "../lib/brain/rank";
import { ANSWER_MAX, cutAt, hfRowsUrl, islamqaLink, islamqaResult, parseHfPage, tableRowFromHf, type IslamqaHit } from "../lib/sources/islamqa-data";

const BAYYINAT = readFileSync(new URL("../supabase/migrations/20261006_bayyinat_search.sql", import.meta.url), "utf8");
const MIGRATION = readFileSync(new URL("../supabase/migrations/20261007_islamqa_fatwas.sql", import.meta.url), "utf8");
const db = new PGlite({ extensions: { pg_trgm } });

const ANSWER_TRAVEL =
  "الحمد لله. الصلاة في الطائرة صحيحة إذا دخل الوقت. ويجب على المصلي في الطائرة أن يستقبل القبلة في صلاة الفريضة، وأن يصلي قائماً إن استطاع. فإن لم يستطع القيام صلى جالساً وأومأ بالركوع والسجود. والله أعلم.";

const HF_ROWS = [
  {
    original_id: "1001",
    topic: "Prayer",
    title_ar: "حكم الصلاة في الطائرة",
    question_ar: "كيف أصلي في الطائرة؟",
    answer_ar: ANSWER_TRAVEL,
    link_ar: "https://islamqa.info/ar/answers/1001",
    title_en: "Praying on a plane",
    question_en: "How should I pray on a plane?",
    answer_en: "Praise be to Allah. Prayer on a plane is valid once the time has begun. The one who prays should face the qiblah if able.",
    link_en: "https://islamqa.info/en/answers/1001",
    title_tr: "Uçakta namaz",
    link_tr: "https://islamqa.info/tr/answers/1001",
    title_es: "Rezar en el avión",
    answer_es: "no se guarda",
  },
  {
    original_id: "1002",
    topic: "Transactions",
    title_ar: "حكم البيع بالتقسيط مع زيادة الثمن",
    question_ar: "",
    answer_ar: "الحمد لله. يجوز البيع بالتقسيط ولو زاد الثمن على ثمن النقد، بشرط أن يتفق المتبايعان على الثمن قبل التفرق.",
    link_ar: "https://islamqa.info/ar/answers/1002",
    title_en: "Ruling on mortgages",
    question_en: "What is the ruling on mortgages from banks?",
    answer_en: "Praise be to Allah. A mortgage with interest is riba.",
    link_en: "https://islamqa.info/en/answers/1002",
  },
  {
    original_id: "1003",
    topic: "Belief",
    title_ar: "ما هي أسباب زيادة الإيمان؟",
    question_ar: "",
    answer_ar: "الحمد لله. للزيادة أسباب: معرفة الله بأسمائه وصفاته.",
    link_ar: "https://islamqa.info/ar/answers/1003",
  },
  { original_id: "1004", topic: "Empty", title_ar: "بلا جواب" },
  { topic: "no id", answer_ar: "x" },
];

before(async () => {
  await db.exec(`create role service_role; create role anon; create role authenticated;
    create table public.bayyinat (number int primary key, question text not null, answer text not null,
      source_url text not null default 'https://dawa.center/file/7937', page int);`);
  await db.exec(BAYYINAT);
  await db.exec(MIGRATION);
  await db.exec(MIGRATION); // آمن لإعادة التشغيل
  const { rows } = parseHfPage({ rows: HF_ROWS.map((row, i) => ({ row_idx: i, row })), num_rows_total: 5 });
  for (const r of rows) {
    const cols = Object.keys(r);
    await db.query(
      `insert into public.islamqa_fatwas (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})
       on conflict (original_id) do update set ${cols.map((c) => `${c} = excluded.${c}`).join(", ")}`,
      cols.map((c) => r[c]),
    );
  }
});

const search = async (q: string, lang = "ar") =>
  (await db.query<{ original_id: string; score: number; links: Record<string, string>; titles: Record<string, string> }>(
    "select * from public.search_islamqa($1, $2, 5)",
    [q, lang],
  )).rows;

describe("migration islamqa_fatwas", () => {
  it("يتطلب ar_normalize من migration «بيّنات» أولاً", async () => {
    const fresh = new PGlite({ extensions: { pg_trgm } });
    await assert.rejects(fresh.exec(MIGRATION), /20261006_bayyinat_search/);
  });

  it("RLS مفعّل بلا سياسات (لا قراءة عامة)", async () => {
    const { rows } = await db.query<{ rls: boolean; policies: number }>(
      "select relrowsecurity as rls, (select count(*)::int from pg_policies where tablename = 'islamqa_fatwas') as policies from pg_class where relname = 'islamqa_fatwas'",
    );
    assert.equal(rows[0].rls, true);
    assert.equal(rows[0].policies, 0);
    const grants = await db.query<{ grantee: string }>(
      "select grantee from information_schema.role_table_grants where table_name = 'islamqa_fatwas' and grantee in ('anon', 'authenticated')",
    );
    assert.equal(grants.rows.length, 0);
  });

  it("العمود المطبَّع من العنوان والسؤال", async () => {
    const { rows } = await db.query<{ ar_norm: string }>("select ar_norm from public.islamqa_fatwas where original_id = '1001'");
    assert.equal(rows[0].ar_norm, "حكم الصلاه في الطايره كيف اصلي في الطايره");
  });

  it("البحث بالعربية والإنجليزية: المتعلق أولاً، ولا شيء لغير المتعلق", async () => {
    assert.equal((await search("ما حكم الصلاة في الطائرة؟"))[0]?.original_id, "1001");
    assert.equal((await search("بيع التقسيط بزيادة الثمن"))[0]?.original_id, "1002");
    assert.equal((await search("What is the ruling on mortgages?", "en"))[0]?.original_id, "1002");
    assert.deepEqual(await search("ما حكم زكاة الخيل؟"), []);
    assert.deepEqual(await search("ما حكم"), [], "الكلمات العامة وحدها لا تكفي");
  });

  it("روابط اللغات الأخرى وعناوينها في الرد، وما ليس في الجدول لا يُحفظ (es)", async () => {
    const hit = (await search("الصلاة في الطائرة"))[0];
    assert.equal(hit.links.tr, "https://islamqa.info/tr/answers/1001");
    assert.equal(hit.titles.tr, "Uçakta namaz");
    const cols = await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'islamqa_fatwas'");
    assert.ok(!cols.rows.some((c) => /_es$|answer_tr/.test(c.column_name)));
  });
});

describe("صفوف Hugging Face ← الجدول", () => {
  it("بلا معرّف أو بلا جواب يسقط، والجواب يُقطع عند 8000 حرف", () => {
    const page = parseHfPage({ rows: HF_ROWS.map((row) => ({ row })), num_rows_total: 19_100 });
    assert.deepEqual(page.rows.map((r) => r.original_id), ["1001", "1002", "1003"]);
    assert.equal(page.count, 5);
    assert.equal(page.total, 19_100);
    const long = tableRowFromHf({ original_id: "9", answer_ar: "كلمة ".repeat(3000) })!;
    assert.ok(long.answer_ar!.length <= ANSWER_MAX);
    assert.equal(cutAt("قصير"), "قصير");
    assert.equal(tableRowFromHf({ original_id: "9", answer_ar: "x", answer_es: "y" })!.answer_es, undefined);
  });

  it("رابط الدفعة", () => {
    assert.equal(
      hfRowsUrl(300),
      "https://datasets-server.huggingface.co/rows?dataset=kingkaung%2Fislamqainfo_parallel_corpus&config=default&split=train&offset=300&length=100",
    );
  });
});

describe("المقتطف الحرفي يقتطعه الكود", () => {
  it("أقرب فقرة لكلمات السؤال، شريحة من النص بحروفه", () => {
    const terms = keywords("ما حكم الصلاة جالسا في الطائرة؟");
    const best = bestParagraphs(ANSWER_TRAVEL, terms)!;
    assert.ok(ANSWER_TRAVEL.includes(best.text.split("\n")[0]), "حرفي");
    assert.match(best.text, /جالساً/);
    assert.equal(bestParagraphs(ANSWER_TRAVEL, keywords("زكاة الخيل")), null);
  });

  it("النص الطويل بلا أسطر يُقسَّم جملاً، وكل فقرة في الحد", () => {
    const long = `${"جملة طويلة عن الصيام والسحور. ".repeat(60)}`;
    const ps = paragraphs(long);
    assert.ok(ps.length > 1);
    assert.ok(ps.every((p) => p.length <= 700 && long.includes(p)));
  });
});

describe("نتيجة البحث ← مصدر", () => {
  const hit: IslamqaHit = {
    original_id: "1001",
    topic: "Prayer",
    title_ar: "حكم الصلاة في الطائرة",
    question_ar: "كيف أصلي في الطائرة؟",
    answer_ar: ANSWER_TRAVEL,
    link_ar: "https://islamqa.info/ar/answers/1001",
    title_en: "Praying on a plane",
    question_en: "How should I pray on a plane?",
    answer_en: "Praise be to Allah. Prayer on a plane is valid. The one who prays should face the qiblah if able.",
    link_en: "https://islamqa.info/en/answers/1001",
    titles: { tr: "Uçakta namaz" },
    links: { tr: "https://islamqa.info/tr/answers/1001", fr: "https://evil.example/x" },
    score: 0.9,
  };

  it("الجهة «الإسلام سؤال وجواب»، والمقتطف من الجواب حرفياً، وفتوى منشورة", () => {
    const r = islamqaResult(hit, "ar", keywords("الصلاة في الطائرة جالسا"))!;
    assert.equal(r.source, "الإسلام سؤال وجواب");
    assert.equal(r.fatwa?.mufti, "الإسلام سؤال وجواب");
    assert.equal(r.fatwa?.host, "islamqa.info");
    assert.ok(ANSWER_TRAVEL.includes(r.fatwa!.answer.split("\n")[0]));
    assert.equal(r.url, "https://islamqa.info/ar/answers/1001");
  });

  it("الرابط بلغة السائل إن وُجد، وإلا العربي؛ ولا رابط خارج islamqa.info", () => {
    assert.equal(islamqaLink(hit, "tr"), "https://islamqa.info/tr/answers/1001");
    assert.equal(islamqaLink(hit, "en"), "https://islamqa.info/en/answers/1001");
    assert.equal(islamqaLink(hit, "fr"), "https://islamqa.info/ar/answers/1001");
    assert.equal(islamqaLink(hit, "ru"), "https://islamqa.info/ar/answers/1001");
    assert.equal(islamqaLink({ ...hit, link_ar: null, link_en: null, links: null }, "de"), "https://islamqa.info/ar/answers/1001");
  });

  it("للإنجليزي النص الإنجليزي، وللتركي العنوان التركي مع الجواب العربي", () => {
    const en = islamqaResult(hit, "en", keywords("pray plane qiblah"))!;
    assert.equal(en.lang, "en");
    assert.match(en.text, /qiblah/);
    const tr = islamqaResult(hit, "tr", keywords("الصلاة في الطائرة"))!;
    assert.equal(tr.title, "Uçakta namaz");
    assert.equal(tr.lang, "ar");
  });
});
