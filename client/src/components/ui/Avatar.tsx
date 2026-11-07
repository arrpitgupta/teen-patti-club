import { avatarColor, initials } from '../../lib/format';

export const AVATARS = [
  '🦁',
  '🐯',
  '🦊',
  '🐼',
  '🐨',
  '🐸',
  '🦉',
  '🐙',
  '🦄',
  '🐝',
  '🌶️',
  '⭐',
] as const;
export const INITIALS = 'initials';

export function Avatar({
  id,
  name,
  avatar,
  size = 48,
  dim = false,
  className = '',
  ring,
}: {
  id: string;
  name: string;
  avatar: string;
  size?: number;
  dim?: boolean;
  className?: string;
  ring?: 'turn' | 'overdue' | 'you' | 'selected' | null;
}) {
  const ringClass =
    ring === 'turn' || ring === 'you'
      ? 'shadow-turn'
      : ring === 'overdue'
        ? 'shadow-overdue'
        : ring === 'selected'
          ? 'shadow-[0_0_0_3px_#072117,0_0_0_5px_#F4F1EA]'
          : 'shadow-[0_0_0_2px_#0B3322]';
  const emoji = avatar !== INITIALS;
  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-display font-semibold ${ringClass} ${className}`}
      style={{
        width: size,
        height: size,
        background: avatarColor(id),
        fontSize: emoji ? size * 0.5 : Math.max(12, size * 0.32),
        opacity: dim ? 0.55 : 1,
        filter: dim ? 'grayscale(0.8)' : undefined,
      }}
    >
      {emoji ? avatar : initials(name)}
    </div>
  );
}
