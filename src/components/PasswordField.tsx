'use client';

import { ChangeEvent, useState } from 'react';

type Props = { label: string; value: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void; autoComplete?: string; minLength?: number; required?: boolean; confirmValue?: string; className?: string };

export default function PasswordField({ label, value, onChange, autoComplete, minLength, required, confirmValue, className = '' }: Props) {
  const [visible, setVisible] = useState(false);
  const mismatch = confirmValue !== undefined && value.length > 0 && value !== confirmValue;
  return <label className={`password-field ${className}`}><span>{label}</span><span className="password-input-wrap"><input className="field" type={visible ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} minLength={minLength} required={required} aria-invalid={mismatch || undefined} /><button type="button" className="password-visibility" onClick={() => setVisible(current => !current)} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} title={visible ? 'Ocultar senha' : 'Mostrar senha'}><span aria-hidden="true">{visible ? '◉' : '◌'}</span></button></span>{mismatch && <small className="password-mismatch">As senhas não coincidem.</small>}</label>;
}
