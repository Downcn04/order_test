import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "积分兑换 Demo",
  description: "完成任务获得积分，兑换数字商品。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
