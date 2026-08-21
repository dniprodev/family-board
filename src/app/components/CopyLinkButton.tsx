import { useState } from "react";

export function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access may be unavailable outside a secure browser context.
    }
  }

  return (
    <button className="copy-link-button" onClick={copyLink} type="button">
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
