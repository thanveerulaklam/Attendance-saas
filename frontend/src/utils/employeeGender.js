export const GENDER_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

export function genderLabel(value) {
  return GENDER_OPTIONS.find((g) => g.value === value)?.label || 'Not specified';
}
