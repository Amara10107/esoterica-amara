/** Campo de contraseña con botón "Ver / Ocultar". Mismas propiedades que un <input>. */
import { useState } from 'react';
import type { InputHTMLAttributes } from 'react';

export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false);
  return (
    <span className="pw-wrap">
      <input {...props} type={shown ? 'text' : 'password'} />
      <button type="button" className="pw-toggle" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Ocultar contraseña' : 'Ver contraseña'} tabIndex={-1}>
        {shown ? 'Ocultar' : 'Ver'}
      </button>
    </span>
  );
}
