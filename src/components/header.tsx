import Link from "next/link";

export function Header() {
  return (
    <header className="topbar shell">
      <Link href="/" className="brand" aria-label="MintaMaaf Online">
        <img className="brand-logo" src="/logo-mark.png" alt="" width={317} height={116} />
        <img className="brand-text" src="/logo-text.png" alt="" width={604} height={72} />
      </Link>
      <nav className="nav">
        <Link href="/#how">How it works</Link>
        <Link href="/#examples">Ideas</Link>
        <Link href="/privacy">Privacy</Link>
      </nav>
      <Link href="/#create" className="nav-cta">Create a page ›</Link>
    </header>
  );
}
