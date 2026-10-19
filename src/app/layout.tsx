import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "inbox — A voicemail box for your repo",
  description:
    "Every GitHub notification is a 400-line diff. This resizes the notification to something you can actually absorb, speaks it, and lets you clear the backlog in three minutes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
