'use client'

import React from 'react'
import { SwitchProps } from '@/types/form'

/**
 * Componente Switch (Toggle)
 * Estilo moderno com animação suave
 */
export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  (
    {
      label,
      description,
      error,
      containerClassName = '',
      switchClassName = '',
      className = '',
      disabled = false,
      id,
      ...props
    },
    ref
  ) => {
    const [isChecked, setIsChecked] = React.useState(props.checked || false)

    return (
      <div className={`flex flex-col gap-2 ${containerClassName}`}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              ref={ref}
              id={id}
              type="checkbox"
              checked={isChecked}
              onChange={(e) => {
                setIsChecked(e.target.checked)
                props.onChange?.(e)
              }}
              disabled={disabled}
              aria-invalid={!!error}
              aria-label={label}
              className="sr-only"
              {...props}
            />
            <label
              htmlFor={id}
              className={`
                flex items-center gap-2 cursor-pointer
                ${disabled ? 'opacity-60 cursor-not-allowed' : ''}
              `}
            >
              <div
                className={`
                  flex-shrink-0 w-11 h-6 rounded-full
                  border-2 border-solid
                  bg-white dark:bg-neutral-900
                  transition-all duration-300
                  ${
                    isChecked
                      ? 'border-primary-500 bg-primary-500'
                      : 'border-neutral-300 bg-neutral-100 dark:bg-neutral-800'
                  }
                  ${disabled ? 'opacity-60' : ''}
                  ${switchClassName}
                `}
              >
                <div
                  className={`
                    w-5 h-5 rounded-full
                    bg-white dark:bg-neutral-50
                    shadow-md
                    transition-transform duration-300
                    ${isChecked ? 'translate-x-full' : 'translate-x-0'}
                  `}
                />
              </div>
              {label && (
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {label}
                </span>
              )}
            </label>
          </div>
        </div>

        {description && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 ml-14">
            {description}
          </p>
        )}

        {error && (
          <span className="text-xs font-medium text-danger-500">
            {error}
          </span>
        )}
      </div>
    )
  }
)

Switch.displayName = 'Switch'
