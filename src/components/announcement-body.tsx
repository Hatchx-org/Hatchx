import { announcementParts } from "@/lib/announcement-links";

export default function AnnouncementBody({ body }: { body: string }) {
  return <>{announcementParts(body).map((part, index) => part.href
    ? <a key={index} href={part.href} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-navy underline underline-offset-2 hover:text-powder">{part.text}</a>
    : <span key={index}>{part.text}</span>)}</>;
}
