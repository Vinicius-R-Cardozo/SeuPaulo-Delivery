import type { ReactNode } from 'react';

export function EmptyState({
  emoji = '🍽️',
  title,
  description,
  action,
}: {
  emoji?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="text-5xl" aria-hidden>
        {emoji}
      </div>
      <h3 className="display text-xl text-cream">{title}</h3>
      {description && <p className="max-w-xs text-sm text-cream-3">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
