// Input.tsx — с логированием
import clsx from 'clsx'
import { DetailedHTMLProps, ElementType, InputHTMLAttributes } from 'react'
import styles from './input.module.scss'

interface InputProps
    extends DetailedHTMLProps<
        InputHTMLAttributes<HTMLInputElement>,
        HTMLInputElement
    > {
    onChange: (evt: React.ChangeEvent<HTMLInputElement>) => void
    onInput?: (evt: React.ChangeEvent<HTMLInputElement>) => void
    onBlur?: (evt: React.FocusEvent<HTMLInputElement>) => void
    value: string | number
    label?: string
    extraClass?: string
    extraClassLabel?: string
    error?: string
    component?: ElementType
    mask?: string | Array<string | RegExp>
}

export function Input({
    onChange,
    onInput,
    onBlur,
    value,
    label,
    extraClassLabel,
    placeholder,
    type,
    extraClass,
    error,
    component: Component = 'input',
    ...props
}: InputProps) {
    // 🔍 ЛОГ: проверяем, передаётся ли onChange как функция
    console.log('Input render:', {
        Component:
            typeof Component === 'string' ? Component : 'CustomComponent',
        hasOnChange: typeof onChange === 'function',
        value,
        name: props.name,
    })

    // Оборачиваем onChange для логирования вызова
    const handleChangeWithLog = (e: React.SyntheticEvent) => {
        console.log('Input onChange called with event:', {
            targetValue: (e.target as HTMLInputElement)?.value,
            targetName: (e.target as HTMLInputElement)?.name,
            eventType: e.type,
        })
        onChange(e as React.ChangeEvent<HTMLInputElement>)
    }

    return (
        <label
            className={clsx(
                styles.form__field,
                extraClassLabel && extraClassLabel
            )}
        >
            {label && (
                <span className={clsx(styles.form__label, styles.modal__title)}>
                    {label}
                </span>
            )}
            <Component
                className={clsx(styles.form__input, extraClass)}
                onInput={onInput}
                onBlur={onBlur}
                onChange={handleChangeWithLog} // ← логируем вызов
                value={value}
                type={type}
                placeholder={placeholder}
                {...props}
            />
            {!!error && <div className={styles.form__error}>{error}</div>}
        </label>
    )
}
