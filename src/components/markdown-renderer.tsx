"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Copy, Check } from "lucide-react";
import { useState, type ComponentPropsWithoutRef } from "react";
import "highlight.js/styles/github-dark.css";

interface MarkdownRendererProps {
  content: string;
  compact?: boolean;
}

export function MarkdownRenderer({ content, compact }: MarkdownRendererProps) {
  return (
    <div className={compact ? "markdown-compact" : "markdown-full"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre({ children }) {
            return <CodeBlockWrapper>{children}</CodeBlockWrapper>;
          },
          code(props: ComponentPropsWithoutRef<"code">) {
            const { children, className, ...rest } = props;
            const isInline = !className;
            if (isInline) {
              return (
                <code
                  className="rounded bg-muted px-1.5 py-0.5 text-[0.85em] font-mono"
                  {...rest}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...rest}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlockWrapper({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const codeEl = (e.currentTarget as HTMLElement)
      .closest(".code-block-wrapper")
      ?.querySelector("code");
    if (codeEl) {
      navigator.clipboard.writeText(codeEl.textContent || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="code-block-wrapper group/code relative my-2 rounded-lg overflow-hidden">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-white/10 text-white/60 opacity-0 transition-opacity hover:bg-white/20 hover:text-white group-hover/code:opacity-100"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
      <pre className="!my-0 overflow-x-auto rounded-lg bg-[#0d1117] p-4 text-sm">
        {children}
      </pre>
    </div>
  );
}
