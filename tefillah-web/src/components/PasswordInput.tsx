import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Password field with a show/hide eye toggle. Drop-in for any password
 * `<input>` — pass the same props (value, onChange, className, etc.); the
 * `type` is managed internally. Renders the input + an eye button as a
 * fragment, so it must sit inside a `position: relative` container (which the
 * existing icon-fields already provide); the eye anchors to that container's
 * right edge and never overlaps a left icon.
 */
export default function PasswordInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <>
      <input {...props} type={show ? 'text' : 'password'} className={`${className} pr-10`} />
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()} // keep focus in the input when toggling
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center"
        style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
        aria-label={show ? 'Hide password' : 'Show password'}
        title={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </>
  );
}
