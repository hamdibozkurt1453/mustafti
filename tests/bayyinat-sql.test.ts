/**
 * migration بحث «بيّنات» (supabase/migrations/20261006_bayyinat_search.sql) على Postgres حقيقي في
 * الذاكرة (PGlite مع pg_trgm)، بلا Supabase: التطبيع، وكلمات السؤال، والترتيب، وعدم إعادة غير المتعلق.
 *   npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const MIGRATION = readFileSync(new URL("../supabase/migrations/20261006_bayyinat_search.sql", import.meta.url), "utf8");
const db = new PGlite({ extensions: { pg_trgm } });

const ROWS: [number, string, string][] = [
  [1, "لماذا يعبد المسلمون الكعبة؟", "المسلمون لا يعبدون الكعبة، وإنما يعبدون الله وحده، والكعبة قِبلةٌ يتوجهون إليها في صلاتهم."],
  [2, "هل انتشر الإسلام بحد السيف؟", "لم ينتشر الإسلام بالسيف، قال تعالى: لا إكراه في الدين."],
  [3, "ما الحكمة من الصيام؟", "شُرع الصيامُ لتحقيق التقوى."],
  [4, "هل القرآن من تأليف محمد؟", "القرآن كلام الله، ليس من تأليف محمد صلى الله عليه وسلم."],
  [5, "لماذا تختلف المذاهب؟", "اختلاف الفهم في النصوص، وهي مسألة لا علاقة لها بالكعبة ولا بالسيف."],
];

before(async () => {
  await db.exec(`create role service_role;
    create table public.bayyinat (number int primary key, question text not null, answer text not null,
      source_url text not null default 'https://dawa.center/file/7937', page int);`);
  for (const r of ROWS) await db.query("insert into public.bayyinat (number, question, answer, page) values ($1, $2, $3, 1)", r);
  await db.exec(MIGRATION);
  await db.exec(MIGRATION); // آمن لإعادة التشغيل
});

const search = async (q: string) =>
  (await db.query<{ number: number; score: number }>("select number, score from public.search_bayyinat($1, 5)", [q])).rows;

describe("بحث «بيّنات» بعد الـ migration", () => {
  it("التطبيع: التشكيل والهمزات والتاء المربوطة والألف المقصورة", async () => {
    const { rows } = await db.query<{ n: string }>("select public.ar_normalize('أَإِآ القِبلةُ مُسْتَشْفى؟') as n");
    assert.equal(rows[0].n, "ااا القبله مستشفي");
  });

  it("كلمات السؤال بلا أدوات الاستفهام والحروف وبلا «ال»", async () => {
    const { rows } = await db.query<{ w: string[] }>("select public.ar_query_words('لماذا يعبد المسلمون الكعبة؟') as w");
    assert.deepEqual([...rows[0].w].sort(), ["كعبه", "مسلمون", "يعبد"]);
  });

  it("السؤال المتعلق أولاً، ولو اختلفت الصياغة والتشكيل", async () => {
    assert.equal((await search("لماذا يعبد المسلمون الكعبة؟"))[0]?.number, 1);
    assert.equal((await search("هل الإسلام انتشر بالسيف؟"))[0]?.number, 2);
    assert.equal((await search("الحكمةُ من الصِّيام"))[0]?.number, 3);
    assert.equal((await search("هل القران من تاليف محمد"))[0]?.number, 4);
  });

  it("لا نتائج غير متعلقة: سؤال لا صلة له، أو أدوات استفهام فقط", async () => {
    assert.deepEqual(await search("ما حكم قضاء صلاة الفجر؟"), []);
    assert.deepEqual(await search("ما هل لماذا"), []);
    assert.deepEqual(await search(""), []);
  });
});
