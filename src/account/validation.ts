export function credentialsError(email: string, password: string, signup: boolean): string {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
  if (!password) return 'Enter your password.';
  if (signup && password.length < 8) return 'Use at least 8 characters for your password.';
  return '';
}
export function profileError(name: string, city: string, bio: string): string {
  if (name.trim().length < 2 || name.trim().length > 80) return 'Your name must be between 2 and 80 characters.';
  if (city.trim().length < 2 || city.trim().length > 120) return 'Your city must be between 2 and 120 characters.';
  if (bio.trim().length > 600) return 'Your bio must be 600 characters or fewer.';
  return '';
}
