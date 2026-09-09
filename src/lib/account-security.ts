export const strongPasswordMinimumLength = 10;

export function strongPasswordIssue(password: string) {
  if (password.length < strongPasswordMinimumLength) return `Use at least ${strongPasswordMinimumLength} characters.`;
  if (!/[a-z]/.test(password)) return "Add at least one lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Add at least one uppercase letter.";
  if (!/\d/.test(password)) return "Add at least one number.";
  return null;
}

export function isReasonablePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}
