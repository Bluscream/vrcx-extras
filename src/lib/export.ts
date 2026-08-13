/**
 * Reusable export and upload utilities for CSV, JSON, and standalone HTML reports.
 */

export function downloadFile(content: string | Blob, filename: string, mimeType: string) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function exportToJson(data: unknown, filename = 'export.json') {
    const jsonStr = JSON.stringify(data, null, 2);
    downloadFile(jsonStr, filename, 'application/json');
}

export function exportToCsv(data: Record<string, unknown>[], filename = 'export.csv') {
    if (!data || data.length === 0) return;

    // Collect all unique keys across rows
    const keys = [...new Set(data.flatMap((row) => Object.keys(row)))];
    
    const lines = [
        keys.map((k) => JSON.stringify(k)).join(','),
        ...data.map((row) =>
            keys.map((k) => {
                const val = row[k];
                if (val === null || val === undefined) return '""';
                if (typeof val === 'object') return JSON.stringify(JSON.stringify(val));
                return JSON.stringify(String(val));
            }).join(',')
        )
    ];

    downloadFile(lines.join('\n'), filename, 'text/csv;charset=utf-8;');
}

/**
 * Generates a self-contained, interactive single-file HTML document.
 *
 * Styling mirrors the app shell: the same VRCX-0 design tokens (oklch neutrals,
 * radius scale, Geist type stack) copied verbatim from `src/styles/globals.css`,
 * so a shared report reads as the same product. Light and dark both ship; the
 * report follows the reader's OS preference and offers a manual toggle, since a
 * shared link has no access to the app's stored theme.
 */
export function generateHtmlReport(title: string, data: Record<string, unknown>[]): string {
    const jsonString = JSON.stringify(data).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <style>
        /* ── VRCX-0 design tokens (kept name-for-name with the app) ────────── */
        :root {
            --background: oklch(1 0 0);
            --foreground: oklch(0.145 0 0);
            --card: oklch(1 0 0);
            --popover: oklch(1 0 0);
            --primary: oklch(0.205 0 0);
            --primary-foreground: oklch(0.985 0 0);
            --secondary: oklch(0.97 0 0);
            --muted: oklch(0.97 0 0);
            --muted-foreground: oklch(0.556 0 0);
            --accent: oklch(0.97 0 0);
            --border: oklch(0.922 0 0);
            --ring: oklch(0.708 0 0);
            --radius: 0.625rem;
            --table-surface: color-mix(in oklch, var(--background) 99%, var(--foreground));
            --table-header-surface: color-mix(in oklch, var(--background) 94%, var(--foreground));
            --main-surface: color-mix(in oklch, var(--background) 98%, var(--foreground));
            --row-hover: color-mix(in oklch, var(--background) 96%, var(--foreground));
        }

        :root[data-theme='dark'] {
            --background: oklch(0.145 0 0);
            --foreground: oklch(0.985 0 0);
            --card: oklch(0.205 0 0);
            --popover: oklch(0.205 0 0);
            --primary: oklch(0.922 0 0);
            --primary-foreground: oklch(0.205 0 0);
            --secondary: oklch(0.269 0 0);
            --muted: oklch(0.269 0 0);
            --muted-foreground: oklch(0.708 0 0);
            --accent: oklch(0.269 0 0);
            --border: oklch(1 0 0 / 10%);
            --ring: oklch(0.556 0 0);
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: 'Geist Variable', system-ui, -apple-system, sans-serif;
            background: var(--main-surface);
            color: var(--foreground);
            padding: 1.5rem;
            line-height: 1.5;
            -webkit-font-smoothing: antialiased;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 1rem;
            margin-bottom: 1.5rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid var(--border);
        }
        .title {
            font-size: 1.5rem;
            font-weight: 700;
            letter-spacing: -0.02em;
            color: var(--foreground);
        }
        .subtitle {
            font-size: 0.875rem;
            color: var(--muted-foreground);
            margin-top: 0.125rem;
        }

        .theme-toggle {
            flex-shrink: 0;
            display: inline-flex;
            align-items: center;
            gap: 0.375rem;
            height: 2rem;
            padding: 0 0.625rem;
            border: 1px solid var(--border);
            border-radius: var(--radius);
            background: var(--secondary);
            color: var(--foreground);
            font: inherit;
            font-size: 0.8rem;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.15s;
        }
        .theme-toggle:hover { background: var(--accent); }
        .theme-toggle:focus-visible { outline: 3px solid var(--ring); outline-offset: 1px; }

        .controls {
            display: flex;
            gap: 0.75rem;
            margin-bottom: 1rem;
            align-items: center;
            flex-wrap: wrap;
        }
        .search-input {
            flex: 1;
            min-width: 12rem;
            max-width: 22rem;
            height: 2rem;
            background: var(--background);
            border: 1px solid var(--border);
            color: var(--foreground);
            padding: 0 0.625rem;
            border-radius: var(--radius);
            font: inherit;
            font-size: 0.875rem;
            outline: none;
            transition: box-shadow 0.15s, border-color 0.15s;
        }
        .search-input::placeholder { color: var(--muted-foreground); }
        .search-input:focus {
            border-color: var(--ring);
            box-shadow: 0 0 0 3px color-mix(in oklch, var(--ring) 50%, transparent);
        }

        .badge {
            display: inline-block;
            padding: 0.15rem 0.5rem;
            border-radius: calc(var(--radius) - 4px);
            font-size: 0.7rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            background: var(--accent);
            color: var(--foreground);
            border: 1px solid var(--border);
        }

        .count-text { font-size: 0.875rem; color: var(--muted-foreground); }

        .table-container {
            background: var(--table-surface);
            border: 1px solid var(--border);
            border-radius: calc(var(--radius) + 4px);
            overflow: hidden;
        }
        table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.825rem; }
        th {
            background: var(--table-header-surface);
            color: var(--muted-foreground);
            font-weight: 600;
            padding: 0.65rem 0.75rem;
            border-bottom: 1px solid var(--border);
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.03em;
        }
        td {
            padding: 0.65rem 0.75rem;
            border-bottom: 1px solid color-mix(in oklch, var(--border) 60%, transparent);
        }
        tr.data-row { cursor: pointer; transition: background-color 0.15s; }
        tr.data-row:hover { background: var(--row-hover); }

        .font-mono { font-family: ui-monospace, SFMono-Regular, 'Geist Mono Variable', monospace; }

        .raw-container {
            background: var(--muted);
            border: 1px solid var(--border);
            padding: 0.75rem;
            border-radius: var(--radius);
            font-family: ui-monospace, SFMono-Regular, monospace;
            font-size: 0.75rem;
            color: var(--muted-foreground);
            white-space: pre-wrap;
            word-break: break-all;
            display: none;
            margin: 0.5rem 0;
        }

        /* Same thin scrollbars as the app shell. */
        * { scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
        *::-webkit-scrollbar { width: 0.625rem; height: 0.625rem; }
        *::-webkit-scrollbar-track { background: transparent; }
        *::-webkit-scrollbar-thumb {
            border: 1px solid transparent;
            border-radius: 9999px;
            background-color: var(--border);
            background-clip: content-box;
        }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <div class="title">${escapeHtml(title)}</div>
            <div class="subtitle">VRCX-Extras report • ${new Date().toLocaleString()}</div>
        </div>
        <button type="button" id="theme-toggle" class="theme-toggle" aria-label="Toggle colour theme">
            <span id="theme-toggle-label">Dark</span>
        </button>
    </div>

    <div class="controls">
        <input type="text" id="search" class="search-input" placeholder="Search report rows…">
        <div id="count" class="count-text">Showing 0 rows</div>
    </div>

    <div class="table-container">
        <table id="report-table">
            <thead><tr id="table-head"></tr></thead>
            <tbody id="table-body"></tbody>
        </table>
    </div>

    <script>
    // Wrapped in an IIFE: htmlpreview.github.io re-injects inline scripts when it
    // renders the page, so top-level declarations must not leak into globals.
    (function () {
        // Theme: follow the reader's OS preference, remember an explicit choice.
        const root = document.documentElement;
        const toggle = document.getElementById('theme-toggle');
        const toggleLabel = document.getElementById('theme-toggle-label');

        function applyTheme(theme) {
            root.dataset.theme = theme;
            root.style.colorScheme = theme;
            toggleLabel.textContent = theme === 'dark' ? 'Light' : 'Dark';
        }

        let stored = null;
        try { stored = localStorage.getItem('vrcx-extras-report-theme'); } catch (err) { /* restricted context */ }
        applyTheme(stored === 'light' || stored === 'dark'
            ? stored
            : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));

        toggle.addEventListener('click', () => {
            const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            try { localStorage.setItem('vrcx-extras-report-theme', next); } catch (err) { /* restricted context */ }
        });

        const data = ${jsonString};
        const searchInput = document.getElementById('search');
        const tableHead = document.getElementById('table-head');
        const tableBody = document.getElementById('table-body');
        const countText = document.getElementById('count');

        if (data.length > 0) {
            const keys = Object.keys(data[0]).filter(k => k !== 'raw');
            keys.forEach(k => {
                const th = document.createElement('th');
                th.textContent = k;
                tableHead.appendChild(th);
            });

            function renderRows(filter = '') {
                tableBody.innerHTML = '';
                const q = filter.toLowerCase();
                const filtered = data.filter(row => {
                    if (!q) return true;
                    return Object.values(row).some(v => String(v).toLowerCase().includes(q));
                });

                countText.textContent = \`Showing \${filtered.length.toLocaleString()} of \${data.length.toLocaleString()} rows\`;

                filtered.forEach((row, i) => {
                    const tr = document.createElement('tr');
                    tr.className = 'data-row';
                    keys.forEach(k => {
                        const td = document.createElement('td');
                        const val = row[k];
                        if (k === 'created_at') td.className = 'font-mono';
                        if (k === 'source') {
                            td.innerHTML = \`<span class="badge">\${val}</span>\`;
                        } else {
                            td.textContent = val !== null && val !== undefined ? String(val) : '—';
                        }
                        tr.appendChild(td);
                    });

                    tableBody.appendChild(tr);

                    if (row.raw) {
                        const detailTr = document.createElement('tr');
                        const detailTd = document.createElement('td');
                        detailTd.colSpan = keys.length;
                        detailTd.style.padding = '0 0.75rem';

                        const pre = document.createElement('div');
                        pre.className = 'raw-container';
                        pre.textContent = JSON.stringify(row.raw, null, 2);

                        detailTd.appendChild(pre);
                        detailTr.appendChild(detailTd);
                        tableBody.appendChild(detailTr);

                        tr.addEventListener('click', () => {
                            pre.style.display = pre.style.display === 'block' ? 'none' : 'block';
                        });
                    }
                });
            }

            searchInput.addEventListener('input', (e) => renderRows(e.target.value));
            renderRows();
        } else {
            tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;">No data available.</td></tr>';
        }
    })();
    </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export interface UploadReportResult {
    /** Primary share link. */
    url: string;
    /** The stored file itself; identical to `url` for raw-HTML hosts. */
    rawUrl?: string;
    /** Always true — only providers that serve renderable text/html are used. */
    renders: boolean;
    localUrl?: string;
    provider: string;
    warning?: string;
}

/**
 * Uploads HTML string via server proxy endpoint `/api/upload` (to avoid CORS)
 */
export async function uploadHtmlReport(
    htmlContent: string,
    filename: string,
): Promise<UploadReportResult> {
    const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: htmlContent, filename })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || `Upload failed with status ${res.status}`);
    }

    return await res.json();
}
