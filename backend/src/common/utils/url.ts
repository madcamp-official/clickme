export function isOpenChatUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "open.kakao.com";
  } catch {
    return false;
  }
}
