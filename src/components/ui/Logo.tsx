import { cn } from '@/utils/cn';

/** Marca do Seu Paulo Delivery: o logo real da casa + selo "Delivery". */
export function Logo({
  size = 'md',
  withText = true,
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  withText?: boolean;
  className?: string;
}) {
  const dim = { sm: 'h-8', md: 'h-11', lg: 'h-16' }[size];
  const tag = { sm: 'text-[10px] px-1.5 py-0.5', md: 'text-xs px-2 py-0.5', lg: 'text-sm px-2.5 py-1' }[size];
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <img src="/logo.png" alt="Seu Paulo Buteco" className={cn(dim, 'w-auto object-contain')} />
      {withText && (
        <span className={cn('display rounded-md bg-brand text-cream', tag)}>Delivery</span>
      )}
    </div>
  );
}
