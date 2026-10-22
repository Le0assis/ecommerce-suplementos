import { ContentBoard } from "@/components/content/content-board";
import { cmsCatalog } from "@pulso/data";

export const metadata = { title: "Conteúdo" };

export default function ContentPage() {
  return <ContentBoard entries={cmsCatalog()} />;
}
