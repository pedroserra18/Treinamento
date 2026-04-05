'use client'

import React from 'react'
import { CheckboxProps } from '@/types/form'
import { FormFieldWrapper } from './FormFieldWrapper'

/**
 * Componente Checkbox reutilizável
 * Com suporte a label, descrição, erro
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      label,
      description,
      error,
      helperText,
      containerClassName = '',
      className = '',
      disabled = false,
      id,
      ...props
    },
    ref
  ) => {
    return (
      <FormFieldWrapper
        id={id}
        error={error}
        helperText={helperText}
        className={containerClassName}
      >
        <div className="flex items-start gap-3">
          <input
            ref={ref}
            id={id}
            type="checkbox"
            disabled={disabled}
            aria-invalid={!!error}
            aria-label={label}
            aria-describedby={error ? `${id}-error` : undefined}
            className={`
              mt-1
              w-5 h-5 rounded
              border border-solid border-neutral-300
              bg-white dark:bg-neutral-900
              text-primary-500
              cursor-pointer
              accent-primary-500
              transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
              disabled:opacity-60 disabled:cursor-not-allowed
              ${className}
            `}
            {...props}
          />
          {label && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor={id}
                className={`text-sm font-medium ${
                  disabled ? 'text-neutral-400' : 'text-neutral-900 dark:text-neutral-100'
                } cursor-pointer`}
              >
                {label}
              </label>
              {description && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {description}
                </p>
              )}
            </div>
          )}
        </div>
      </FormFieldWrapper>
    )
  }
)

Checkbox.displayName = 'Checkbox'
