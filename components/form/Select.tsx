'use client'

import React from 'react'
import { SelectProps } from '@/types/form'
import { FormFieldWrapper } from './FormFieldWrapper'

/**
 * Componente Select reutilizável
 * Com suporte a label, erro, helperText e múltiplas opções
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      showRequired = true,
      options,
      placeholder,
      containerClassName = '',
      className = '',
      disabled = false,
      id,
      ...props
    },
    ref
  ) => {
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
          <select
            ref={ref}
            id={id}
            disabled={disabled}
            required={required}
            aria-invalid={!!error}
            aria-label={label}
            aria-describedby={error ? `${id}-error` : undefined}
            className={`
              w-full px-3 py-2.5 rounded-md
              border border-solid
              text-sm font-normal
              bg-white dark:bg-neutral-900
              text-neutral-900 dark:text-neutral-50
              transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-offset-0
              appearance-none cursor-pointer
              pr-10
              ${getStateClass()}
              ${disabled ? 'cursor-not-allowed opacity-60' : ''}
              ${className}
            `}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option
                key={`${option.value}`}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>

          {/* Ícone de dropdown */}
          <div className="pointer-events-none absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-500 dark:text-neutral-400">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </div>
        </div>
      </FormFieldWrapper>
    )
  }
)

Select.displayName = 'Select'
