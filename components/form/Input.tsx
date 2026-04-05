'use client'

import React from 'react'
import { BaseInputProps } from '@/types/form'
import { FormFieldWrapper } from './FormFieldWrapper'

/**
 * Componente Input reutilizável e configurável
 * Suporta múltiplos estados: default, focus, error, disabled, success
 * Com suporte a icon, label, erro e helperText
 */
export const Input = React.forwardRef<HTMLInputElement, BaseInputProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      showRequired = true,
      icon,
      containerClassName = '',
      className = '',
      disabled = false,
      id,
      placeholder,
      type = 'text',
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = React.useState(false)

    // Determinar estado do input
    const getStateClass = () => {
      if (disabled) return 'disabled:bg-neutral-50 disabled:text-neutral-500'
      if (error) return 'border-danger-500 focus:border-danger-500 focus:ring-danger-100'
      return 'border-neutral-300 focus:border-primary-500 focus:ring-primary-100'
    }

    return (
      <FormFieldWrapper
        id={id}
        label={label}
        error={error}
        helperText={helperText}
        required={required}
        showRequired={showRequired}
        className={containerClassName}
      >
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-500 dark:text-neutral-400 flex items-center">
              {icon}
            </div>
          )}

          <input
            ref={ref}
            id={id}
            type={type}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            aria-invalid={!!error}
            aria-label={label || placeholder}
            aria-describedby={error ? `${id}-error` : undefined}
            onFocus={(e) => {
              setIsFocused(true)
              props.onFocus?.(e)
            }}
            onBlur={(e) => {
              setIsFocused(false)
              props.onBlur?.(e)
            }}
            className={`
              w-full px-3 py-2.5 rounded-md
              border border-solid
              text-sm font-normal
              bg-white dark:bg-neutral-900
              text-neutral-900 dark:text-neutral-50
              placeholder:text-neutral-400 dark:placeholder:text-neutral-600
              transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-offset-0
              ${icon ? 'pl-10' : ''}
              ${getStateClass()}
              ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-text'}
              ${className}
            `}
            {...props}
          />
        </div>
      </FormFieldWrapper>
    )
  }
)

Input.displayName = 'Input'
