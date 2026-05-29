import type { Metadata } from 'next';
import { Inter, Outfit } from 'next/font/google';
import './globals.css';
import { CartProvider } from '@/lib/cart-context';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import CartDrawer from '@/components/CartDrawer';
import ChatWidget from '@/components/ChatWidget';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'StyleSense — AI-Powered Fashion Search',
    template: '%s | StyleSense',
  },
  description:
    'Discover fashion through AI. Search by description, upload an image, or chat with our Style Assistant. CLIP-powered visual search meets Gemini AI.',
  keywords: ['fashion', 'AI search', 'CLIP', 'visual search', 'multimodal', 'e-commerce'],
  openGraph: {
    type: 'website',
    title: 'StyleSense — AI-Powered Fashion Search',
    description: 'Find fashion by what you mean, not just what you type.',
    siteName: 'StyleSense',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <body style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <CartProvider>
          <Navbar />
          <main style={{ flex: 1 }}>{children}</main>
          <Footer />
          <CartDrawer />
          <ChatWidget />
        </CartProvider>
      </body>
    </html>
  );
}
