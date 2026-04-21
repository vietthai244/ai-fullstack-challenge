// frontend/src/components/EmailTokenizer.tsx
//
// Shared email tag-input component. Comma, Enter, or Space key converts
// the current input value into an email chip token. onBlur also commits.
import React, { useState } from 'react';

export function EmailTokenizer({
  value,
  onChange,
}: {
  value: string[];
  onChange: (emails: string[]) => void;
}): React.ReactElement {
  const [inputValue, setInputValue] = useState('');

  const addEmail = (raw: string) => {
    const emails = raw
      .split(/[,\s]+/)
      .map((e) => e.trim())
      .filter(Boolean)
      .filter((e) => !value.includes(e));
    if (emails.length > 0) {
      onChange([...value, ...emails]);
      setInputValue('');
    }
  };

  return (
    <div className="flex flex-wrap gap-1 rounded-md border p-2 min-h-[2.5rem]">
      {value.map((email, i) => (
        <span
          key={`${email}-${i}`}
          className="flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-sm"
        >
          {email}
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground leading-none"
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            aria-label={`Remove ${email}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
            e.preventDefault();
            addEmail(inputValue);
          }
        }}
        onBlur={() => {
          if (inputValue) addEmail(inputValue);
        }}
        placeholder={value.length === 0 ? 'Add email addresses...' : ''}
        className="flex-1 outline-none bg-transparent text-sm min-w-[8rem]"
      />
    </div>
  );
}
