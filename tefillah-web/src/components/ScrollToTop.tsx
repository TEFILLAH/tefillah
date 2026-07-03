import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Browsers preserve scroll position across history entries, but with a
 * client-side router the new page mounts at whatever scroll position the old
 * page was at. So clicking a footer link (which sits at the bottom of the
 * page) navigates to /about but lands the visitor near the bottom — making
 * the navigation feel broken.
 *
 * Mount this inside <BrowserRouter> once. On every route change it:
 *  - scrolls to the element matching the URL hash (if present), so /about#privacy
 *    works the way a static site would
 *  - otherwise scrolls the page to the top instantly
 *
 * No effect on programmatic scroll done by individual pages after mount.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const id = hash.startsWith('#') ? hash.slice(1) : hash;
      const el = id ? document.getElementById(id) : null;
      if (el) {
        // Smooth scroll to the anchor section.
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    // No hash, or the target element isn't in the DOM: jump to the top.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, hash]);

  return null;
}
