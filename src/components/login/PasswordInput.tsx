import { forwardRef, useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { TextInput } from './TextInput'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

export const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(props, ref) {
  const [visible, setVisible] = useState(false)

  return (
    <TextInput
      ref={ref}
      type={visible ? 'text' : 'password'}
      leftIcon={<Lock size={16} strokeWidth={1.75} />}
      rightSlot={
        <button
          type="button"
          aria-label={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible((v) => !v)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[#62789A] hover:bg-[#EAF4FF] hover:text-[#031C45]"
        >
          {visible ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
        </button>
      }
      {...props}
    />
  )
})
