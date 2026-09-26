import React from 'react';
import Link from 'next/link';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  // primary/secondary/danger reuse the legacy .btn-* classes so migrated
  // and un-migrated screens share one look.
  primary: 'btn btn-primary',
  secondary: 'btn btn-secondary',
  danger: 'btn btn-danger',
  ghost: 'btn bg-transparent text-fg-secondary hover:text-fg',
};

const SIZE: Record<Size, string> = {
  sm: 'h-9 px-3 py-0 text-[0.82rem]',
  md: 'h-11 py-0',
  lg: 'h-12 px-6 py-0 text-[1rem]',
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn(VARIANT[variant], SIZE[size], 'whitespace-nowrap', className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  href,
}: CommonProps & { href: string }) {
  return (
    <Link href={href} className={cn(VARIANT[variant], SIZE[size], 'whitespace-nowrap no-underline hover:no-underline', className)}>
      {children}
    </Link>
  );
}
