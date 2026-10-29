"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Chat needs readable Markdown, without the editor's syntax-highlighting bundle. */
export function AssistantMessage({ content }: { content: string }) {
  return (
    <div className="lyte-message">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
