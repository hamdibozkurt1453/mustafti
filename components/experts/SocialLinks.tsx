import { getTranslations } from "next-intl/server";
import { SOCIAL_KEYS, type Socials } from "@/lib/experts/types";

/** حسابات المختص العامة (روابط تحققت صيغتها عند الحفظ). لا هاتف ولا بريد هنا أبداً. */
export async function SocialLinks({ socials }: { socials: Socials }) {
  const t = await getTranslations("experts.profile.socials");
  const entries = SOCIAL_KEYS.filter((k) => socials[k]);
  if (!entries.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {entries.map((k) => (
        <li key={k}>
          <a
            href={socials[k]}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-block rounded-full border border-green-900/20 bg-white px-3 py-1.5 text-sm font-semibold text-green-900 hover:bg-green-900/5"
          >
            {t(k)}
          </a>
        </li>
      ))}
    </ul>
  );
}
