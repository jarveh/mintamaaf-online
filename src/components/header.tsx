import Link from "next/link";

export function Header() {
  return <header className="topbar shell"><Link href="/" className="brand"><span className="brand-mark">✳</span> mintamaaf</Link><nav className="nav"><Link href="/#how">How it works</Link><Link href="/#examples">Ideas</Link><Link href="/privacy">Privacy</Link></nav><Link href="/#create" className="nav-cta">Create a page ›</Link></header>;
}
