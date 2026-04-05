'use client'

import React from 'react'
import { FormFieldWrapperProps } from '@/types/form'

/**
 * Wrapper reutilizável para campos de formulário
 * Centraliza label, erro e texto de ajuda
 */
export const FormFieldWrapper = React.forwardRef<
  HTMLDivElement,
  FormFieldWrapperProps
>(
  (
    {
      id,
      label,
      error,
      helperText,
      required,
      showRequired,
      children,
      className = '',
    },
    ref
  ) => {
    const showRequiredAsterisk = showRequired || (required && showRequired !== false)

    return (
      <div
        ref={ref}
        className={`flex flex-col gap-1.5 w-full ${className}`}
      >
        {label && (
          <label
            htmlFor={id}
            className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
          >
            {label}
            {showRequiredAsterisk && (
              <span className="ml-1 text-danger-500" aria-label="required">
                *
              </span>
            )}
          </label>
        )}

        {children}

        {error && (
          <span className="text-xs font-medium text-danger-500">
            {error}
          </span>
        )}

        {helperText && !error && (
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {helperText}
          </span>
        )}
      </div>
    )
  }
)

FormFieldWrapper.displayName = 'FormFieldWrapper'
