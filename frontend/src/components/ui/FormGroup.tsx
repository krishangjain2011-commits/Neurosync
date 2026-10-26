import React from "react";

interface FormGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  children: React.ReactNode;
}

export const FormGroup = React.forwardRef<HTMLDivElement, FormGroupProps>(
  ({ label, error, helperText, required = false, className = "", children, ...props }, ref) => {
    return (
      <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }} className={className} {...props}>
        {label && (
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", fontWeight: 600, color: "#1F2937" }}>
            <span>{label}</span>
            {required && <span style={{ color: "#DC2626" }}>*</span>}
          </label>
        )}
        {children}
        {error && <p style={{ color: "#DC2626", fontSize: "0.875rem", margin: 0 }}>{error}</p>}
        {helperText && !error && (
          <p style={{ color: "#6B7280", fontSize: "0.875rem", margin: 0 }}>{helperText}</p>
        )}
      </div>
    );
  }
);

FormGroup.displayName = "FormGroup";
