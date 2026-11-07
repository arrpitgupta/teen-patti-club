import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Variant = 'gold' | 'goldOutline' | 'ivory' | 'panel' | 'ghost' | 'danger';
type Size = 'lg' | 'md' | 'sm';

const VARIANTS: Record<Variant, string> = {
  // Gold is only for "your turn" actions.
  gold: 'bg-gold-500 text-gold-ink shadow-[0_6px_18px_rgba(217,169,63,0.35)] active:bg-gold-600',
  goldOutline:
    'bg-transparent text-gold-400 shadow-[inset_0_0_0_2px_#D9A93F] active:bg-gold-500/10',
  ivory: 'bg-ink-100 text-felt-950 active:bg-ink-300',
  panel: 'bg-panel text-ink-100 active:bg-panel-raised',
  ghost: 'bg-transparent text-ink-100 active:bg-white/5',
  danger:
    'bg-panel text-down shadow-[inset_0_0_0_1.5px_rgba(255,138,128,0.5)] active:bg-panel-raised',
};

const SIZES: Record<Size, string> = {
  lg: 'min-h-[60px] rounded-2xl px-5 text-[17px]',
  md: 'min-h-[48px] rounded-xl px-4 text-[15px]',
  sm: 'min-h-[44px] rounded-xl px-3 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  children?: ReactNode;
  block?: boolean;
}

export function Button({
  variant = 'panel',
  size = 'md',
  icon,
  block,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        'inline-flex select-none items-center justify-center gap-2 font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:bg-panel-sunk disabled:text-ink-500 disabled:shadow-none',
        VARIANTS[variant],
        SIZES[size],
        block ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'lg' ? 22 : 18} />}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  className = '',
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { icon: IconName; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 items-center justify-center rounded-xl text-ink-300 active:bg-white/5 ${className}`}
      {...rest}
    >
      <Icon name={icon} size={22} />
    </button>
  );
}
