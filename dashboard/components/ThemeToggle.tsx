"use client";

import { useTheme, type Theme } from "@/lib/theme";

/** system -> light -> dark -> system. Order matches the icons so the next state is predictable. */
const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = { system: "Follow system", light: "Light", dark: "Dark" };

function Icon({ theme }: { theme: Theme }) {
  if (theme === "light") {
    return (                                     // sun
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
           strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
      </svg>
    );
  }
  if (theme === "dark") {
    return (                                     // moon
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
           strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.6 6.6 0 0 0 10.5 10.5Z" />
      </svg>
    );
  }
  return (                                       // half-filled: following the system
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
         strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(NEXT[theme])}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[NEXT[theme]]}.`}
      title={`Theme: ${LABEL[theme]}`}
      // The server cannot know the stored choice, so the icon can differ for one frame.
      suppressHydrationWarning
    >
      <Icon theme={theme} />
    </button>
  );
}
