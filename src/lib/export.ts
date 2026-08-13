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
 * Anyone opening the HTML file in a browser gets a dark-themed, filterable report
 * with row expansion and JSON inspection.
 */
export function generateHtmlReport(title: string, data: Record<string, unknown>[]): string {
    const jsonString = JSON.stringify(data).replace(/</g, '\\u003c');
    
    return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <style>
        :root {
            --bg: #090d16;
            --card: #111827;
            --muted: #1f2937;
            --border: #374151;
            --text: #f3f4f6;
            --subtext: #9ca3af;
            --primary: #6366f1;
            --primary-bg: rgba(99, 102, 241, 0.15);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: system-ui, -apple-system, sans-serif;
            background-color: var(--bg);
            color: var(--text);
            padding: 1.5rem;
            line-height: 1.5;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid var(--border);
        }
        .title { font-size: 1.5rem; font-weight: 700; color: #fff; }
        .subtitle { font-size: 0.875rem; color: var(--subtext); margin-top: 0.25rem; }
        .controls {
            display: flex;
            gap: 0.75rem;
            margin-bottom: 1rem;
            align-items: center;
        }
        .search-input {
            flex: 1;
            max-width: 360px;
            background: var(--card);
            border: 1px solid var(--border);
            color: var(--text);
            padding: 0.5rem 0.75rem;
            border-radius: 0.5rem;
            font-size: 0.875rem;
            outline: none;
        }
        .search-input:focus { border-color: var(--primary); }
        .badge {
            display: inline-block;
            padding: 0.15rem 0.5rem;
            border-radius: 0.25rem;
            font-size: 0.7rem;
            font-weight: 600;
            text-transform: uppercase;
            background: var(--primary-bg);
            color: var(--primary);
            border: 1px solid rgba(99, 102, 241, 0.3);
        }
        .count-text { font-size: 0.875rem; color: var(--subtext); }
        .table-container {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 0.75rem;
            overflow: hidden;
        }
        table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.825rem; }
        th {
            background: var(--muted);
            color: var(--subtext);
            font-weight: 600;
            padding: 0.65rem 0.75rem;
            border-bottom: 1px solid var(--border);
            font-size: 0.75rem;
            text-transform: uppercase;
        }
        td { padding: 0.65rem 0.75rem; border-bottom: 1px solid rgba(55, 65, 81, 0.5); }
        tr.data-row { cursor: pointer; transition: background 0.15s; }
        tr.data-row:hover { background: rgba(255, 255, 255, 0.04); }
        .font-mono { font-family: ui-monospace, SFMono-Regular, monospace; }
        .raw-container {
            background: #000;
            padding: 0.75rem;
            border-radius: 0.5rem;
            font-family: monospace;
            font-size: 0.75rem;
            color: #10b981;
            white-space: pre-wrap;
            word-break: break-all;
            display: none;
            margin: 0.5rem 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <div class="title">${escapeHtml(title)}</div>
            <div class="subtitle">Generated report • ${new Date().toLocaleString()}</div>
        </div>
    </div>
    
    <div class="controls">
        <input type="text" id="search" class="search-input" placeholder="Search report rows...">
        <div id="count" class="count-text">Showing 0 rows</div>
    </div>

    <div class="table-container">
        <table id="report-table">
            <thead><tr id="table-head"></tr></thead>
            <tbody id="table-body"></tbody>
        </table>
    </div>

    <script>
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

/**
 * Uploads HTML string via server proxy endpoint `/api/upload` (to avoid CORS)
 */
export async function uploadHtmlReport(
    htmlContent: string,
    filename: string,
    provider: 'catbox' | 'litterbox' | 'transfersh' = 'catbox'
): Promise<string> {
    const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: htmlContent, filename, provider })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || `Upload failed with status ${res.status}`);
    }

    const data = await res.json();
    return data.url;
}
