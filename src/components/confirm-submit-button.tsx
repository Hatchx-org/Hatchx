"use client";

import type { ButtonHTMLAttributes } from "react";

export default function ConfirmSubmitButton({
  confirmation,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { confirmation: string }) {
  return <button {...props} onClick={(event) => {
    if (!window.confirm(confirmation)) event.preventDefault();
  }} />;
}
