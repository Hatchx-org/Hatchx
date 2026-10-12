"use client";

export default function SelectAll({ formId }: { formId: string }) {
  function toggle() {
    const form = document.getElementById(formId);
    if (!form) return;
    const boxes = [...form.querySelectorAll<HTMLInputElement>('input[name="notification_id"]')];
    const shouldCheck = boxes.some((box) => !box.checked);
    boxes.forEach((box) => { box.checked = shouldCheck; });
  }
  return <button type="button" onClick={toggle} className="text-xs font-bold text-navy">Select/clear page</button>;
}
