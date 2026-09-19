import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

// A copyable terminal command, used on the landing page and in the setup guide.
export default function Command({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; the command is still on screen to copy by hand.
    }
  };
  return (
    <div className="command">
      <code>{text}</code>
      <button className="icon-btn" onClick={copy} aria-label={`Copy ${text}`}>
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
  );
}
