import { useState } from 'react';
import {
    DownloadIcon,
    FileCodeIcon,
    FileTextIcon,
    FileJsonIcon,
    CheckIcon,
    CopyIcon,
    Loader2Icon,
    ExternalLinkIcon,
    GlobeIcon,
} from 'lucide-react';
import { exportToCsv, exportToJson, downloadFile, generateHtmlReport, uploadHtmlReport } from '@/lib/export';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

interface ExportDropdownProps {
    title: string;
    filenamePrefix: string;
    data: Record<string, unknown>[];
    disabled?: boolean;
}

export function ExportDropdown({ title, filenamePrefix, data, disabled }: ExportDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const { copiedKey, copy } = useCopyToClipboard();

    const handleExportJson = () => {
        exportToJson(data, `${filenamePrefix}.json`);
        setIsOpen(false);
    };

    const handleExportCsv = () => {
        exportToCsv(data, `${filenamePrefix}.csv`);
        setIsOpen(false);
    };

    const handleExportHtml = () => {
        const html = generateHtmlReport(title, data);
        downloadFile(html, `${filenamePrefix}.html`, 'text/html');
        setIsOpen(false);
    };

    const handleUploadHtml = async () => {
        try {
            setUploading(true);
            setUploadError(null);
            setUploadedUrl(null);
            const html = generateHtmlReport(title, data);
            const url = await uploadHtmlReport(html, `${filenamePrefix}.html`, 'catbox');
            setUploadedUrl(url);
            // Automatically copy URL to clipboard
            await copy(url, 'uploaded-url');
        } catch (err: unknown) {
            setUploadError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="relative inline-block text-left">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                disabled={disabled || data.length === 0}
                className="flex items-center gap-1.5 rounded-lg border bg-secondary px-3.5 py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 transition-colors shadow-xs"
            >
                <DownloadIcon className="size-3.5" />
                Export / Share
            </button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

                    {/* Menu Popover */}
                    <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-xl ring-1 ring-border/40 animate-in fade-in-0 zoom-in-95">
                        <div className="px-2 py-1.5 text-[0.7rem] font-semibold text-muted-foreground uppercase tracking-wider">
                            Save Locally
                        </div>
                        <button
                            type="button"
                            onClick={handleExportCsv}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent transition-colors"
                        >
                            <FileTextIcon className="size-4 text-emerald-400" />
                            CSV Spreadsheet (.csv)
                        </button>
                        <button
                            type="button"
                            onClick={handleExportJson}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent transition-colors"
                        >
                            <FileJsonIcon className="size-4 text-amber-400" />
                            Raw JSON (.json)
                        </button>
                        <button
                            type="button"
                            onClick={handleExportHtml}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent transition-colors"
                        >
                            <FileCodeIcon className="size-4 text-blue-400" />
                            Interactive Single-Page HTML (.html)
                        </button>

                        <div className="my-1 border-t border-border/50" />

                        <div className="px-2 py-1.5 text-[0.7rem] font-semibold text-muted-foreground uppercase tracking-wider">
                            Upload & Share
                        </div>
                        <button
                            type="button"
                            onClick={handleUploadHtml}
                            disabled={uploading}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs bg-primary/10 text-primary font-medium hover:bg-primary/20 disabled:opacity-50 transition-colors"
                        >
                            {uploading ? (
                                <Loader2Icon className="size-4 animate-spin" />
                            ) : (
                                <GlobeIcon className="size-4 text-primary" />
                            )}
                            {uploading ? 'Uploading to Catbox…' : 'Upload HTML & Get Share Link'}
                        </button>

                        {/* Upload Result Notification */}
                        {uploadedUrl && (
                            <div className="mt-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2 text-xs text-emerald-400 space-y-1.5">
                                <div className="flex items-center justify-between font-semibold">
                                    <span className="flex items-center gap-1">
                                        <CheckIcon className="size-3.5" /> Uploaded & Copied!
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 bg-background/80 rounded border p-1 text-[0.68rem] font-mono">
                                    <span className="flex-1 truncate">{uploadedUrl}</span>
                                    <button
                                        type="button"
                                        onClick={() => copy(uploadedUrl, 'uploaded-url')}
                                        className="hover:text-foreground shrink-0 p-0.5"
                                        title="Copy URL"
                                    >
                                        {copiedKey === 'uploaded-url' ? <CheckIcon className="size-3 text-emerald-400" /> : <CopyIcon className="size-3" />}
                                    </button>
                                    <a
                                        href={uploadedUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="hover:text-foreground shrink-0 p-0.5"
                                        title="Open Link"
                                    >
                                        <ExternalLinkIcon className="size-3" />
                                    </a>
                                </div>
                            </div>
                        )}

                        {uploadError && (
                            <div className="mt-2 rounded-lg bg-destructive/10 border border-destructive/30 p-2 text-[0.7rem] text-destructive">
                                {uploadError}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
