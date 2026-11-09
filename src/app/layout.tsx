import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";

import { THEME_COOKIE, themeClass } from "@/lib/theme";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "TrueROAS — know which ad made the money",
    template: "%s · TrueROAS",
  },
  description:
    "Marketing attribution and AI analytics for B2B SaaS. Tie every trial and every dollar of MRR back to the exact ad that produced it.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Rendering the theme class server-side removes the usual inline script and
  // with it any flash of the wrong theme. An absent cookie renders no class,
  // leaving the CSS to follow the user's operating system.
  const theme = themeClass((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="en" className={theme}>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
