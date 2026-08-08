import ogImage from "@/assets/og-image.png";

export const siteConfig = {
  name: "Jaei.page",
  description: "지나간 생각과 아직 끝나지 않은 질문을 기록합니다.",
  url: "https://jaei.page",
  lang: "ko",
  locale: "ko_KR",
  author: "Jaei",
  twitter: "@_Jae_i",
  ogImage: ogImage,
  socialLinks: {
    twitter: "https://x.com/_Jae_i",
    instagram: "https://www.instagram.com/jaei.page/",
    github: "",
    discord: "",
  },
  navLinks: [
    { text: "Home", href: "/" },
    { text: "About", href: "/about" },
    { text: "Psychology", href: "/psychology" },
    { text: "Philosophy", href: "/philosophy" },
    { text: "Reflections", href: "/reflections" },
  ],
};
