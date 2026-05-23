export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load — Agent Cloud</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { --bg: #fafbfc; --fg: #111827; --muted: #6b7280; --primary: #2563eb; --primary-fg: #fff; --radius: 0.5rem; }
      @media (prefers-color-scheme: dark) { :root { --bg: #0b1121; --fg: #f3f4f6; --muted: #9ca3af; --primary: #3b82f6; } }
      * { box-sizing: border-box; }
      body { font: 16px/1.6 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--fg); display: grid; place-items: center; min-height: 100vh; margin: 1rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2.5rem; }
      .icon { display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 9999px; background: rgba(239,68,68,0.1); color: #ef4444; margin-bottom: 1.5rem; }
      .icon svg { width: 32px; height: 32px; }
      h1 { font-size: 1.25rem; font-weight: 600; margin: 1.5rem 1.5rem; letter-spacing: -1.5px; }
      p { color: var(--muted); margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
      button, a { font: inherit; padding: 0.6rem 1.25rem; border-radius: var(--radius); cursor: pointer; text-decoration: none; border: 1px solid transparent; font-weight: 500; display: inline-flex; align-items: center; gap: 0.5rem; }
      .primary { background: var(--primary); color: var(--primary-fg); }
      .primary:hover { filter: brightness(1.05); }
      .secondary { background: transparent; color: var(--fg); border-color: #d1d5db; }
      .secondary:hover { background: rgba(0,0,0,0.03); }
      .brand { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 1.5rem; color: var(--fg); font-weight: 700; font-size: 1.125rem; }
      .brand-dot { width: 24px; height: 24px; background: var(--primary); border-radius: 0.375rem; display: inline-grid; place-items: center; }
      .brand-dot svg { width: 14px; height: 14px; color: #fff; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="brand">
        <span class="brand-dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19c0-1.7-1.3-3-3-3h-5c-1.7 0-3 1.3-3 3"/><path d="M17.5 19H22V9c2-1.5-4-4-10-4S2 7.5 2 9v10h4.5"/><path d="M12 11v3"/><path d="M12 18a3 3 0 1 0 0-6 3 3 0 0 1 0 6z"/></svg></span>
        Agent Cloud
      </div>
      <div class="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 1 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
      </div>
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
          Try again
        </button>
        <a class="secondary" href="/">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Go home
        </a>
      </div>
    </div>
  </body>
</html>`;
}
