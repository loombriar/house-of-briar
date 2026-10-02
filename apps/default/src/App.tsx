import { lazy, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { GenesisSection } from '@/lib/genesis';
import { GenesisAuth } from '@/lib/genesis-auth';

const HomePage = lazy(() => import('@/pages/HomePage'));
const ShopPage = lazy(() => import('@/pages/ShopPage'));
const ProductPage = lazy(() => import('@/pages/ProductPage'));
const DesignersPage = lazy(() => import('@/pages/DesignersPage'));
const AccountPage = lazy(() => import('@/pages/AccountPage'));
const CartPage = lazy(() => import('@/pages/CartPage'));
const CheckoutPage = lazy(() => import('@/pages/CheckoutPage'));

function Section({ name, children }: { name: string; children: ReactNode }) {
  return <GenesisSection name={name}>{children}</GenesisSection>;
}

function AppRoutes() {
  return <BrowserRouter>
    <Routes>
      <Route path="/" element={<Section name="Home"><HomePage /></Section>} />
      <Route path="/shop" element={<Section name="Shop"><ShopPage /></Section>} />
      <Route path="/shop/:productId" element={<Section name="Product"><ProductPage /></Section>} />
      <Route path="/designers" element={<Section name="Designers"><DesignersPage /></Section>} />
      <Route path="/account" element={<Section name="Your studio"><AccountPage /></Section>} />
      <Route path="/cart" element={<Section name="Bag"><CartPage /></Section>} />
      <Route path="/checkout" element={<Section name="Checkout"><CheckoutPage /></Section>} />
    </Routes>
  </BrowserRouter>;
}

export default function App() {
  useEffect(() => {
    document.title = 'House of Briar';
    document.documentElement.lang = 'en';

    const manifest = document.querySelector('link[rel="manifest"]') ?? document.createElement('link');
    manifest.setAttribute('rel', 'manifest');
    manifest.setAttribute('href', '/manifest.webmanifest');
    if (!manifest.parentNode) document.head.appendChild(manifest);

    const themeColor = document.querySelector('meta[name="theme-color"]') ?? document.createElement('meta');
    themeColor.setAttribute('name', 'theme-color');
    themeColor.setAttribute('content', '#c9ae72');
    if (!themeColor.parentNode) document.head.appendChild(themeColor);

    const logoUrl = 'https://files.taskade.com/space-files/dcdb0306-5408-4b6e-9f03-5548f7a3e865/original/house-of-briar-crest.png';
    const favicon = document.querySelector('link[rel="icon"]') ?? document.createElement('link');
    favicon.setAttribute('rel', 'icon');
    favicon.setAttribute('type', 'image/png');
    favicon.setAttribute('href', logoUrl);
    if (!favicon.parentNode) document.head.appendChild(favicon);

    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]') ?? document.createElement('link');
    appleIcon.setAttribute('rel', 'apple-touch-icon');
    appleIcon.setAttribute('href', logoUrl);
    if (!appleIcon.parentNode) document.head.appendChild(appleIcon);
  }, []);

  return <GenesisAuth><AppRoutes /></GenesisAuth>;
}
