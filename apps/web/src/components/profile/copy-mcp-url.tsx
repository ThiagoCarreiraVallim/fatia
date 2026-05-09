'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CopyMcpUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
      <code className="flex-1 truncate text-xs">{url}</code>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={handleCopy}
        aria-label="Copiar URL"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}
