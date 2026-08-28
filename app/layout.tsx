import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MIYEON SPIDER · Пасьянс Паук",
  description: "Коллекционный пасьянс Паук с Миён, ежедневными раскладками и рейтингом игроков.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
