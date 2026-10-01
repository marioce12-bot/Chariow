import { splitLinks } from "@/lib/linkify";
import "./linkified-text.css";

// Affiche un texte de chat en rendant les liens http/https cliquables (éléments React, jamais de HTML brut).
export function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((part, index) =>
        part.type === "link" ? (
          <a key={index} className="chat-link" href={part.href} target="_blank" rel="noopener noreferrer">
            {part.value}
          </a>
        ) : (
          part.value
        ),
      )}
    </>
  );
}
