'use client'

import React from 'react'
import { TextareaProps } from '@/types/form'
import { FormFieldWrapper } from './FormFieldWrapper'

/**
 * Componente Textarea reutilizável
 * Com suporte a label, erro, helperText e estados
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      showRequired = true,
      containerClassName = '',
      className = '',
      disabled = false,
      id,
      placeholder,
      rows = 4,
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
        <textarea
          ref={ref}
          id={id}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          rows={rows}
          aria-invalid={!!error}
          aria-label={label || placeholder}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`
            w-full px-3 py-2.5 rounded-md
            border border-solid
            text-sm font-normal
            bg-white dark:bg-neutral-900
            text-neutral-900 dark:text-neutral-50
            placeholder:text-neutral-400 dark:placeholder:text-neutral-600
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-offset-0
            resize-none
            ${getStateClass()}
            ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-text'}
            ${className}
          `}
          {...props}
        />
      </FormFieldWrapper>
    )
  }
)

Textarea.displayName = 'Textarea'
