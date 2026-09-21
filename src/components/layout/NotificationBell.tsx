import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { repository } from '@/services';
import type { AppNotification } from '@/types';
import { timeAgo } from '@/utils/format';
import { cn } from '@/utils/cn';

/** Sino de notificações com contagem de não lidas e painel. */
export function NotificationBell() {
  const { profile } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    const load = () => repository.getNotifications(profile.id).then((n) => active && setItems(n));
    load();
    const t = setInterval(load, 4000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [profile]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const unread = items.filter((n) => !n.read).length;

  const markAll = async () => {
    await Promise.all(items.filter((n) => !n.read).map((n) => repository.markNotificationRead(n.id)));
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open && unread) void markAll();
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-cream hover:bg-ink-3"
        aria-label={`Notificações${unread ? `, ${unread} não lidas` : ''}`}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-cream">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="animate-in absolute right-0 top-12 z-50 w-80 max-w-[85vw] overflow-hidden rounded-xl border border-ink-3 bg-ink-2 shadow-boteco">
          <div className="border-b border-ink-3 px-4 py-3">
            <p className="display text-sm text-cream">Notificações</p>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-cream-3">Nada por aqui ainda.</p>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    'border-b border-ink-3/60 px-4 py-3 last:border-0',
                    !n.read && 'bg-brand/5',
                  )}
                >
                  <p className="text-sm font-semibold text-cream">{n.title}</p>
                  <p className="mt-0.5 text-xs text-cream-3">{n.body}</p>
                  <p className="mt-1 text-[10px] text-cream-3/70">{timeAgo(n.createdAt)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
