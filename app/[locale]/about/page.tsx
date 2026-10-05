import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { PagePlaceholder, placeholderMetadata } from "@/components/PagePlaceholder";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return placeholderMetadata(locale, "about");
}

/**
 * إسناد المحتوى المستورد وتراخيصه (R1d). أسماء المصادر والتراخيص بنصها، فيُعرض الإسناد بالعربية
 * لصفحة العربية وبالإنجليزية لغيرها حتى تُترجم الصفحة كاملة.
 */
function Attribution({ ar }: { ar: boolean }) {
  const dataset = "https://huggingface.co/datasets/kingkaung/islamqainfo_parallel_corpus";
  const license = "https://creativecommons.org/licenses/by-nc/4.0/";
  return (
    <section className="mt-8 rounded-2xl border border-sand-200 bg-white p-6" dir={ar ? "rtl" : "ltr"}>
      <h2 className="text-xl font-bold">{ar ? "المصادر والتراخيص" : "Sources and licenses"}</h2>
      <p className="mt-3 text-ink-600">
        {ar ? (
          <>
            الفتاوى المنشورة من موقع{" "}
            <a href="https://islamqa.info" className="font-semibold text-green-600 underline underline-offset-4" target="_blank" rel="noopener noreferrer">
              الإسلام سؤال وجواب
            </a>{" "}
            (بإشراف الشيخ محمد صالح المنجد) تُعرض للاطلاع فقط بنصها ورابطها الأصلي، من المجموعة العامة{" "}
            <a href={dataset} className="underline underline-offset-4" target="_blank" rel="noopener noreferrer" dir="ltr">
              kingkaung/islamqainfo_parallel_corpus
            </a>{" "}
            على Hugging Face، بترخيص{" "}
            <a href={license} className="underline underline-offset-4" target="_blank" rel="noopener noreferrer" dir="ltr">
              CC BY-NC 4.0
            </a>{" "}
            (استعمال غير تجاري مع الإسناد). مُستفتي لا يغيّر نص الفتوى ولا يطبّقها على حالة السائل.
          </>
        ) : (
          <>
            Published fatwas from{" "}
            <a href="https://islamqa.info" className="font-semibold text-green-600 underline underline-offset-4" target="_blank" rel="noopener noreferrer">
              IslamQA (islamqa.info)
            </a>{" "}
            (supervised by Sheikh Muhammad Saalih al-Munajjid) are shown for reference only, verbatim and with their original link, from the public dataset{" "}
            <a href={dataset} className="underline underline-offset-4" target="_blank" rel="noopener noreferrer">
              kingkaung/islamqainfo_parallel_corpus
            </a>{" "}
            on Hugging Face, licensed{" "}
            <a href={license} className="underline underline-offset-4" target="_blank" rel="noopener noreferrer">
              CC BY-NC 4.0
            </a>{" "}
            (non-commercial use with attribution). Mustafti does not alter a fatwa or apply it to the asker&apos;s case.
          </>
        )}
      </p>
    </section>
  );
}

/** `/about` — عن مستفتي. */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  return (
    <PagePlaceholder page="about">
      <Attribution ar={locale === "ar"} />
    </PagePlaceholder>
  );
}
