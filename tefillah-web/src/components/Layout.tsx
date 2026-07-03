import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';

interface LayoutProps {
  variant?: 'public' | 'app';
  showFooter?: boolean;
  hideNav?: boolean;
}

export default function Layout({ variant = 'public', showFooter = true, hideNav = false }: LayoutProps) {
  // Signed-in (app) pages drop the marketing footer; the main area then fills the
  // viewport so content isn't left floating above empty space. Legal pages also
  // hide the nav + footer for a clean, distraction-free read.
  const footerVisible = showFooter && variant !== 'app' && !hideNav;
  return (
    <div className="min-h-screen flex flex-col">
      <Header variant={variant} hideNav={hideNav} />
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
      {footerVisible && <Footer />}
    </div>
  );
}
