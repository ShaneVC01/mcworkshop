import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-display font-semibold uppercase tracking-[0.06em] transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-button hover:bg-primary-hover active:bg-primary-hover',
        dark: 'bg-foreground text-background hover:opacity-90 active:opacity-90',
        outline: 'border-2 border-foreground bg-transparent text-foreground hover:bg-secondary active:bg-secondary',
        ghost: 'text-foreground hover:bg-secondary active:bg-secondary',
        destructive: 'bg-destructive text-destructive-foreground hover:opacity-90 active:opacity-90',
      },
      size: {
        md: 'min-h-touch px-5 text-base',
        lg: 'min-h-touch-lg px-7 text-lg',
        icon: 'size-touch',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
