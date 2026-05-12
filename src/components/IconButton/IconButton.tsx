import { ButtonHTMLAttributes } from 'preact';

export function IconButton({ children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button class={`icon-btn`} data-variant={className} {...rest}>
      {children}
    </button>
  );
}
