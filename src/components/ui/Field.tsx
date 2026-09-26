import React from 'react';
import { cn } from './cn';

/** Label + control + optional hint, built on the legacy .form-label / .form-input look. */
export function Field({ label, hint, htmlFor, className, children }: {
  label: string;
  hint?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={htmlFor} className="form-label mb-0 text-[0.72rem] uppercase tracking-wide">{label}</label>
      {children}
      {hint && <span className="text-[0.7rem] text-fg-muted">{hint}</span>}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn('form-input', className)} {...rest} />;
  }
);

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('form-input', className)} {...rest}>
      {children}
    </select>
  );
}
