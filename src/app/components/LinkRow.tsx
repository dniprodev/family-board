import { CopyLinkButton } from "./CopyLinkButton";

export function LinkRow({ label, link }: { label: string; link: string }) {
  return (
    <div className="link-row">
      <div className="link-row-header">
        <span className="link-row-label">{label}</span>
        <CopyLinkButton link={link} />
      </div>
      <a className="link-row-value" href={link}>
        {link}
      </a>
    </div>
  );
}
