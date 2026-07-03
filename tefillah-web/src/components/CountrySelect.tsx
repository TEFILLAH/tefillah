import { COUNTRIES } from '../data/countries';

/**
 * Dropdown of all countries. `value` is the ISO-2 code; `onChange` reports the
 * newly selected ISO-2 code. Styled with the shared `.input` class so it lines
 * up with the other form fields.
 */
export default function CountrySelect({
  value,
  onChange,
  id,
  className = 'input',
  required = true,
}: {
  value: string;
  onChange: (iso2: string) => void;
  id?: string;
  className?: string;
  required?: boolean;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      required={required}
      style={{ appearance: 'auto' }}
    >
      {COUNTRIES.map((c) => (
        <option key={c.iso2} value={c.iso2}>
          {c.name} (+{c.dial})
        </option>
      ))}
    </select>
  );
}
