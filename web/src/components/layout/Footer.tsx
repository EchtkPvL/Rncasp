export function Footer() {
  return (
    <footer className="py-4 text-center text-xs text-[var(--color-muted-foreground)]">
      <a
        href="https://github.com/EchtkPvL/Rncasp"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-[var(--color-foreground)] hover:underline"
      >
        Rncasp v{__APP_VERSION__}
      </a>
      {" \u00b7 Licensed under "}
      <a
        href="https://github.com/EchtkPvL/Rncasp/blob/main/LICENSE"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-[var(--color-foreground)] hover:underline"
      >
        AGPL-3.0
      </a>
    </footer>
  );
}
