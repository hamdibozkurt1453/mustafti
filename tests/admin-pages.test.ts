/**
 * صحة صياغة السكربتات المضمّنة في صفحات app/api/admin/**: كل سكربت داخل قالب
 * (template literal) في TypeScript يُفسَّر فيه \n و\t و\' قبل وصوله للمتصفح، فيكسر خطأ
 * صياغة واحد الصفحة كلها. نستخرج نص كل <script> كما يراه المتصفح (بعد تفسير القالب)
 * ونتحقق منه بـ new Function.
 *   npm test
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ADMIN_DIR = join(process.cwd(), "app", "api", "admin");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === "route.ts" ? [path] : [];
  });
}

/** نصوص <script> كما يصل للمتصفح: تُستبدل ${...} بقيمة وهمية ثم يُفسَّر القالب. */
function browserScripts(source: string): string[] {
  const scripts: string[] = [];
  for (const m of source.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    const template = m[1].replace(/\$\{[^}]*\}/g, "null");
    scripts.push(new Function(`return \`${template}\`;`)() as string);
  }
  return scripts;
}

describe("سكربتات صفحات الإدارة المضمّنة", () => {
  const files = routeFiles(ADMIN_DIR).filter((f) => readFileSync(f, "utf8").includes("<script>"));

  it("توجد صفحات مضمّنة السكربت", () => {
    assert.ok(files.length >= 5, `وُجد ${files.length} فقط`);
  });

  for (const file of files) {
    it(`${file.slice(ADMIN_DIR.length + 1)}: صياغة السكربت سليمة`, () => {
      const scripts = browserScripts(readFileSync(file, "utf8"));
      assert.ok(scripts.length > 0);
      for (const script of scripts) {
        assert.doesNotThrow(() => new Function(script));
      }
    });
  }
});
