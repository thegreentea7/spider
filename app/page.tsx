"use client";

import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    window.location.replace("/game/index.html");
  }, []);

  return (
    <main className="site-shell">
      <p>Открываем пасьянс…</p>
      <a href="/game/index.html">Открыть игру</a>
    </main>
  );
}
