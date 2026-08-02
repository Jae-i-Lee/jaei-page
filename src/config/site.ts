import ogImage from "@/assets/og-image.png";

export const siteConfig = {
  name: "네로",
  description:
    "사색과 일상을 기록하는 공간입니다. 군더더기 없는 문장으로 생각을 정리합니다.",
  url: "https://jaei.page",
  lang: "ko",
  locale: "ko_KR",
  author: "네로",
  twitter: "@_Jae_i",
  ogImage: ogImage,
  socialLinks: {
    twitter: "https://x.com/_Jae_i",
    email: "nyxia159@gmail.com",
    discord: "",
  },
  navLinks: [
    { text: "Home", href: "/" },
    { text: "About", href: "/about" },
    { text: "Blog", href: "/blog" },
  ],
};