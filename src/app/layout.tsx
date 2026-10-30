import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'React Reference Architecture',
  description: '基于 Next.js 的现代 React 应用架构参考实现',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
