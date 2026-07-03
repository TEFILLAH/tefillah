import { Link } from 'react-router-dom';
import Logo from './Logo';

export default function Footer() {
  return (
    <footer
      className="border-t mt-16"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-1 md:grid-cols-4 gap-10">
        <div className="md:col-span-2">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <span className="font-serif text-2xl tracking-[0.18em]">Tefillah</span>
          </div>
          <p
            className="mt-4 max-w-md text-sm leading-relaxed"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            A sacred space for prayer. Submit the petitions of your heart, receive
            scripture in return, and partner with intercessors around the world.
          </p>
        </div>

        <div>
          <h3 className="eyebrow">Visit</h3>
          <ul className="mt-4 space-y-2 text-sm">
            <li><Link to="/" className="hover:underline">Home</Link></li>
            <li><Link to="/signup" className="hover:underline">Begin Your Journey</Link></li>
            <li><Link to="/login" className="hover:underline">Sign in</Link></li>
            <li><Link to="/partner/login" className="hover:underline">For partners</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="eyebrow">Information</h3>
          <ul className="mt-4 space-y-2 text-sm">
            <li><Link to="/about" className="hover:underline">About</Link></li>
            <li><Link to="/privacy" className="hover:underline">Privacy Policy</Link></li>
            <li><Link to="/terms" className="hover:underline">Terms and Conditions</Link></li>
            <li>
              <a href="mailto:admin@tefillah.in" className="hover:underline">
                admin@tefillah.in
              </a>
            </li>
            <li>
              <a href="mailto:grievance@tefillah.in" className="hover:underline">
                grievance@tefillah.in
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div
        className="border-t py-6 px-4 sm:px-6 lg:px-8 text-xs flex flex-col sm:flex-row gap-2 justify-between max-w-6xl mx-auto"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
      >
        <span>© {new Date().getFullYear()} Tefillah. All rights reserved.</span>
        <span className="font-serif italic">Soli Deo gloria.</span>
      </div>
    </footer>
  );
}
