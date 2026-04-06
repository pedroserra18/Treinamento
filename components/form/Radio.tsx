'use client'

import React from 'react'
import { RadioProps, RadioGroupProps } from '@/types/form'
import { FormFieldWrapper } from './FormFieldWrapper'

/**
 * Componente Radio individual
 */
export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
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
            type="radio"
            disabled={disabled}
            aria-label={label}
            aria-describedby={error ? `${id}-error` : undefined}
            className={`
              mt-1
              w-5 h-5 rounded-full
              border-2 border-solid border-neutral-300
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

Radio.displayName = 'Radio'

/**
 * Componente RadioGroup para múltiplas opções
 */
export const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  (
    {
      name,
      value,
      options,
      onChange,
      error,
      helperText,
      label,
      disabled = false,
      containerClassName = '',
      showRequired,
      required,
    },
    ref
  ) => {
    return (
      <FormFieldWrapper
        error={error}
        helperText={helperText}
        label={label}
        required={required}
        showRequired={showRequired}
        className={containerClassName}
      >
        <div ref={ref} className="flex flex-col gap-3">
          {options.map((option) => (
            <div key={`${option.value}`} className="flex items-start gap-3">
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={(e) => onChange?.(e.target.value)}
                disabled={disabled || option.disabled}
                id={`${name}-${option.value}`}
                className={`
                  mt-1
                  w-5 h-5 rounded-full
                  border-2 border-solid border-neutral-300
                  bg-white dark:bg-neutral-900
                  text-primary-500
                  cursor-pointer
                  accent-primary-500
                  transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
                  disabled:opacity-60 disabled:cursor-not-allowed
                `}
              />
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${name}-${option.value}`}
                  className={`text-sm font-medium ${
                    disabled || option.disabled
                      ? 'text-neutral-400'
                      : 'text-neutral-900 dark:text-neutral-100'
                  } cursor-pointer`}
                >
                  {option.label}
                </label>
                {option.description && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {option.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </FormFieldWrapper>
    )
  }
)

RadioGroup.displayName = 'RadioGroup'
