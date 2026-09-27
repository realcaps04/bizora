export function RememberDevice({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 select-none">
      <span className="relative flex h-[18px] w-[18px] items-center justify-center">
        <input
          type="checkbox"
          className="peer absolute inset-0 cursor-pointer opacity-0"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          className={`flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border transition ${
            checked ? 'border-[#0878F9] bg-[#0878F9]' : 'border-[#D8E4F2] bg-white'
          }`}
        >
          {checked ? (
            <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden>
              <path
                d="M1.5 4.5L4.2 7.2L9.5 1.5"
                stroke="white"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </span>
      </span>
      <span className="text-[13px] text-[#62789A]">Remember this device</span>
    </label>
  )
}
