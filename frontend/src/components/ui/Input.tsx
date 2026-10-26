import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ icon, iconPosition = "left", className = "", style, ...props }, ref) => {
    const containerStyle: React.CSSProperties = {
      position: "relative" as const,
      display: "flex",
      alignItems: "center",
    };

    const inputStyle: React.CSSProperties = {
      width: "100%",
      ...style,
      paddingLeft: icon && iconPosition === "left" ? "2.5rem" : undefined,
      paddingRight: icon && iconPosition === "right" ? "2.5rem" : undefined,
    };

    const iconStyle: React.CSSProperties = {
      position: "absolute" as const,
      left: iconPosition === "left" ? "0.75rem" : undefined,
      right: iconPosition === "right" ? "0.75rem" : undefined,
      color: "#6B7280",
      pointerEvents: "none",
      display: "flex",
      alignItems: "center",
    };

    return (
      <div style={containerStyle}>
        {icon && <span style={iconStyle}>{icon}</span>}
        <input ref={ref} className={className} style={inputStyle} {...props} />
      </div>
    );
  }
);

Input.displayName = "Input";
