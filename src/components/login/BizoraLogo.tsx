import { LOGO_SRC } from '@/components/BrandLogo'

/**
 * Uses public/Bizora_applogo.png (transparent — no black square).
 * The PNG already includes the Bizora wordmark.
 */
export function BizoraLogo({
  variant = 'light',
  size = 'md',
  centered = false,
  showSubtitle = true,
}: {
  variant?: 'light' | 'dark'
  size?: 'sm' | 'md' | 'lg'
  centered?: boolean
  showSubtitle?: boolean
}) {
  const icon =
    size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-10 w-10'
  const subtitle = size === 'sm' ? 'text-[10.5px]' : 'text-[11.5px]'

  return (
    <div
      className={`inline-flex bg-transparent ${
        centered ? 'flex-col items-center gap-2 text-center' : 'items-center gap-3'
      }`}
    >
      <img
        src={LOGO_SRC}
        alt="Bizora"
        className={`${icon} bg-transparent object-contain`}
        draggable={false}
      />
      {showSubtitle ? (
        <div
          className={`font-medium ${subtitle} ${
            variant === 'light' ? 'text-[#A8C7EF]' : 'text-[#62789A]'
          }`}
        >
          Business Management
        </div>
      ) : null}
    </div>
  )
}
