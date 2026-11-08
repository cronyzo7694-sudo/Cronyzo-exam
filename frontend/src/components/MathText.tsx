import { MathJax } from "better-react-mathjax";

type Props = {
  text?: string | null;
  html?: string | null;
  className?: string;
};

/**
 * Renders plain text or HTML with MathJax support.
 * Prefer html when present; otherwise wrap text for inline math \( ... \).
 */
export function MathText({ text, html, className }: Props) {
  if (html) {
    return (
      <MathJax dynamic hideUntilTypeset="first">
        <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
      </MathJax>
    );
  }
  if (!text) return null;
  // If text already contains TeX delimiters, let MathJax handle it
  return (
    <MathJax dynamic hideUntilTypeset="first">
      <div className={className} style={{ whiteSpace: "pre-wrap" }}>
        {text}
      </div>
    </MathJax>
  );
}
