import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Goatesque · Two worlds. One way out.",
  description: "Explore a shifting labyrinth together in Goatesque, with local or online co-op.",
  manifest: "/game/app-manifest.json",
  appleWebApp: { capable:true, title:"Goatesque", statusBarStyle:"black-translucent" },
  icons: {
    icon: "/favicon.svg?v=2",
    shortcut: "/favicon.svg?v=2",
    apple: "/game/icons/goatesque-180.png",
  },
};
export const viewport={width:"device-width",initialScale:1,viewportFit:"cover"};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
