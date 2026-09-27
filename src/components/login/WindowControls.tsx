import { Minus, Square, X } from 'lucide-react'

export function WindowControls({ className = '' }: { className?: string }) {
  async function minimize() {
    await window.bizora?.windowMinimize?.()
  }
  async function maximize() {
    await window.bizora?.windowMaximize?.()
  }
  async function close() {
    await window.bizora?.windowClose?.()
  }

  return (
    <div className={`flex items-center ${className}`} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        type="button"
        aria-label="Minimize"
        onClick={() => void minimize()}
        className="flex h-10 w-11 items-center justify-center text-[#031C45]/80 transition-colors hover:bg-[#EAF4FF]"
      >
        <Minus size={14} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-label="Maximize"
        onClick={() => void maximize()}
        className="flex h-10 w-11 items-center justify-center text-[#031C45]/80 transition-colors hover:bg-[#EAF4FF]"
      >
        <Square size={12} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-label="Close"
        onClick={() => void close()}
        className="flex h-10 w-11 items-center justify-center text-[#031C45]/80 transition-colors hover:bg-red-500 hover:text-white"
      >
        <X size={15} strokeWidth={1.75} />
      </button>
    </div>
  )
}
