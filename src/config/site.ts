import ogImage from "@/assets/og-image.png";

export const siteConfig = {
  name: "Nero",
  description:
    "사색과 일상을 기록하는 공간입니다. 군더더기 없는 문장으로 생각을 정리합니다.",
  url: "https://jaei.page",
  lang: "ko",
  locale: "ko_KR",
  author: "Nero",
  X: "@_Jae_i",
  ogImage: ogImage,
  socialLinks: {
    X: "https://x.com/_Jae_i",
    github: "https://github.com/Jae-i-Lee",
    discord: "https://discord.com",
  },
  navLinks: [
    { text: "Home", href: "/" },
    { text: "About", href: "/about" },
    { text: "Blog", href: "/blog" },
  ],
};