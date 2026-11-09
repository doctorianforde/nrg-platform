/** "Chrome on Windows", "Safari on iPhone"… from a browser's user-agent string, for the admin shared-accounts list. */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const os = /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
    : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "Mac"
    : /CrOS/.test(ua) ? "Chromebook"
    : /Linux/.test(ua) ? "Linux"
    : null;
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /Firefox|FxiOS/.test(ua) ? "Firefox"
    : /Chrome|CriOS/.test(ua) ? "Chrome"
    : /Safari/.test(ua) ? "Safari"
    : /node|undici|curl|python|okhttp|axios/i.test(ua) ? "a script or app (not a browser)"
    : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown device";
}
