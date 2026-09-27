import { cn } from '@/utils'

/**
 * public/Bizora_applogo.png. BASE_URL is "/" in dev and "./" in the packaged app,
 * so the file resolves next to index.html instead of the drive root.
 */
export const LOGO_SRC = `${import.meta.env.BASE_URL}Bizora_applogo.png`

export function BrandLogo({
  className,
  size = 'md',
  showWordmark = false,
}: {
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showWordmark?: boolean
}) {
  const sizeClass =
    size === 'sm' ? 'h-7 w-7' : size === 'md' ? 'h-9 w-9' : size === 'lg' ? 'h-11 w-11' : 'h-16 w-16'

  return (
    <div className={cn('inline-flex items-center gap-2.5 bg-transparent', className)}>
      <img
        src={LOGO_SRC}
        alt="Bizora"
        className={cn('bg-transparent object-contain select-none', sizeClass)}
        draggable={false}
      />
      {showWordmark ? (
        <span className="text-[13px] font-semibold tracking-tight text-ink">Bizora</span>
      ) : null}
    </div>
  )
}
