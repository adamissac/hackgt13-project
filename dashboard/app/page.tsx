import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: 24, maxWidth: 560 }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Formal Connection</h1>
      <p className="muted" style={{ marginTop: 0 }}>HackGT 13 dashboards</p>
      <ul style={{ lineHeight: 2, paddingLeft: 18 }}>
        <li><Link href="/graph">Connection Graph</Link></li>
      </ul>
    </main>
  );
}
