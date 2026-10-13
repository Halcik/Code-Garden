import type { HTMLInputTypeAttribute } from "react";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
  type?: HTMLInputTypeAttribute;
  error?: string;
  required?: boolean;
  disabled?: boolean;
};

export default function FormField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  type = "text",
  error,
  required = true,
  disabled = false,
}: Props) {
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
