import { Fragment } from "react";
import { LinkifiedText } from "@/components/LinkifiedText";
import { splitAssistantText } from "@/lib/assistant-text";
import "./assistant-message-text.css";

export function AssistantMessageText({ text }: { text: string }) {
  return (
    <span className="chat-assistant-text">
      {splitAssistantText(text).map((part, index) =>
        part.strong ? (
          <strong key={index}><LinkifiedText text={part.value} /></strong>
        ) : (
          <Fragment key={index}><LinkifiedText text={part.value} /></Fragment>
        ),
      )}
    </span>
  );
}
