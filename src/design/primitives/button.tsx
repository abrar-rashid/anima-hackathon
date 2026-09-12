import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cx } from '../cx'
import styles from './button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'silent' | 'danger'
export type ButtonSize = 'sm' | 'md'

export type ButtonProps = {
  variant?: ButtonVariant
  size?: ButtonSize
  busy?: boolean
  children: ReactNode
  ref?: Ref<HTMLButtonElement>
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>

const variantClass: Record<ButtonVariant, string> = {
  primary: styles.primary,
  secondary: styles.secondary,
  silent: styles.silent,
  danger: styles.danger,
}

const sizeClass: Record<ButtonSize, string> = {
  sm: styles.sm,
  md: styles.md,
}

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  disabled,
  type = 'button',
  children,
  ref,
  ...rest
}: ButtonProps) {
  const inert = Boolean(disabled || busy)
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={cx(styles.button, variantClass[variant], sizeClass[size], busy && styles.busy)}
      disabled={inert}
      aria-disabled={inert || undefined}
      aria-busy={busy || undefined}
    >
      {busy ? 'Working. Outcome is not yet proven.' : children}
    </button>
  )
}
