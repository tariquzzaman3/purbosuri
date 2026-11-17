import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { personName } from '../data/format';
import type { Person } from '../data/types';

/**
 * Choose a person from a long list: the list is alphabetical, typing narrows it down, and the
 * arrow button opens the whole list to pick from, as a plain drop-down would.
 */
export function PersonPicker({
  people,
  value,
  onChange,
}: {
  people: Person[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { t, lang } = useI18n();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => {
    const locale = lang === 'bn' ? 'bn' : 'en';
    return people
      .map((p) => ({ p, name: personName(p, lang, t('unknownName')) }))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [people, lang, t]);

  const chosen = sorted.find((x) => x.p.id === value);
  // Show the chosen name, unless the person is in the middle of typing.
  const shown = typing ? text : (chosen?.name ?? text);
  const needle = typing ? text.trim().toLowerCase() : '';
  const matches = needle ? sorted.filter((x) => x.name.toLowerCase().includes(needle)) : sorted;

  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) {
        setOpen(false);
        setTyping(false);
      }
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('touchstart', outside);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('touchstart', outside);
    };
  }, [open]);

  const pick = (id: string) => {
    onChange(id);
    setTyping(false);
    setText('');
    setOpen(false);
  };

  return (
    <div className="picker" ref={wrap}>
      <div className="picker-box">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          placeholder={t('pickerSearch')}
          value={shown}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value);
            setTyping(true);
            setOpen(true);
            if (value) onChange('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              setTyping(false);
            } else if (e.key === 'Enter' && open && matches.length > 0) {
              e.preventDefault();
              pick(matches[0].p.id);
            }
          }}
        />
        <button
          type="button"
          className="picker-toggle"
          aria-label={t('pickerOpen')}
          onClick={() => {
            setTyping(false);
            setOpen((o) => !o);
          }}
        >
          ▾
        </button>
      </div>
      {open && (
        <ul className="picker-list" role="listbox">
          {matches.length === 0 ? (
            <li className="muted small picker-none">{t('pickerNone')}</li>
          ) : (
            matches.map((x) => (
              <li
                key={x.p.id}
                role="option"
                aria-selected={x.p.id === value}
                className={x.p.id === value ? 'picker-item active' : 'picker-item'}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(x.p.id)}
              >
                {x.name}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
