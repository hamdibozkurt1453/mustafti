/**
 * اختبار المقارنة بين النماذج المرشحة الأربعة (الخطة 0.4) من سطر الأوامر:
 *
 *   OPENROUTER_API_KEY=... npm run model-test            # يطبع التقرير
 *   OPENROUTER_API_KEY=... npm run model-test -- --write # ويضيفه إلى docs/decisions.md
 *
 * المنطق كله في lib/model-test.ts، وهو نفسه الذي يشغّله المسار المحمي
 * /api/admin/model-test (للمشرف الأعلى مع MFA) حين لا تصل البيئة المحلية إلى OpenRouter.
 */
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { runModelTest, toMarkdown } from "@/lib/model-test";

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY is not set (.env.local or the environment).");
    process.exit(1);
  }
  // النموذج الافتراضي لا يلزم هنا (كل نموذج يُمرَّر صراحة)، لكن isLlmConfigured يتطلبه.
  process.env.LLM_MODEL ||= "google/gemma-4-31b-it";

  const result = await runModelTest();
  const markdown = toMarkdown(result);
  console.log(markdown);

  if (process.argv.includes("--write")) {
    appendFileSync(join(process.cwd(), "docs", "decisions.md"), `\n${markdown}`);
    console.log("→ appended to docs/decisions.md");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
