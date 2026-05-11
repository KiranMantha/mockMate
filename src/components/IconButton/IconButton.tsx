import { ButtonHTMLAttributes } from 'preact';

export function IconButton({ children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button class={`icon-btn icon-btn--${className}`} {...rest}>
      {children}
    </button>
  );
}
