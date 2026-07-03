import { type InputHTMLAttributes } from 'react';

/**
 * Phone number input with a fixed country dial-code prefix on the left (e.g.
 * "+91"). The prefix is driven by the selected country; the input holds only
 * the local number. Combine on submit as `+{dial} {value}`.
 */
export default function PhoneCodeInput({
  dial,
  className = 'input',
  ...props
}: { dial: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex">
      <span
        className="inline-flex items-center font-medium"
        style={{
          padding: '0.75rem 0.875rem',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-strong)',
          borderRight: 'none',
          borderTopLeftRadius: 'var(--radius-md)',
          borderBottomLeftRadius: 'var(--radius-md)',
          color: 'var(--color-text-secondary)',
          fontSize: '0.95rem',
          whiteSpace: 'nowrap',
        }}
      >
        +{dial}
      </span>
      <input
        {...props}
        type="tel"
        inputMode="tel"
        className={className}
        style={{ flex: 1, minWidth: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
      />
    </div>
  );
}
