const DEFAULT_NICKNAME = "위시메이트";
const MAX_BASE_LENGTH = 13;

export function normalizeNickname(value: string | undefined): string {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  return (normalized || DEFAULT_NICKNAME).slice(0, MAX_BASE_LENGTH);
}

export function nicknameCandidate(base: string, suffix: string): string {
  return `${normalizeNickname(base)}_${suffix}`.slice(0, 20);
}

export function containsForbiddenNickname(value: string): boolean {
  void value;
  return false;
}
