import { AnnouncementBar, BottomNav, SiteFooter, SiteHeader } from "@/components/layout/chrome";

export default function BlogArticleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AnnouncementBar />
      <SiteHeader />
      <main id="conteudo" className="pb-24 md:pb-10">{children}</main>
      <SiteFooter />
      <BottomNav />
    </>
  );
}
