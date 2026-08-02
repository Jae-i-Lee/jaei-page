import ogImage from "@/assets/og-image.png";

export const siteConfig = {
  name: "Jaei.page",
  description:
    "사색과 일상을 기록하는 공간입니다. 군더더기 없는 문장으로 생각을 정리합니다.",
  url: "https://jaei.page",
  lang: "ko",
  locale: "ko_KR",
  author: "Jaei",
  twitter: "@_Jae_i",
  ogImage: ogImage,
  socialLinks: {
    twitter: "https://x.com/_Jae_i",
    github: "",
    discord: "",
  },
  navLinks: [
    { text: "Home", href: "/" },
    { text: "About", href: "/about" },
    { text: "Psychology", href: "/blog/category/psychology" },
    { text: "Philosophy", href: "/blog/category/philosophy" },
    { text: "Reflections", href: "/blog/category/reflections" },
  ],
};
