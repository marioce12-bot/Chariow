import type { CSSProperties } from "react";

/** Real text remains available to screen readers; visual letters animate only once. */
export function AnimatedHeroTitle({ first, second, last }: { first: string; second: string; last: string }) {
  let index = 0;
  function letters(text: string) {
    return text.split(/(\s+)/).map((word, wordIndex) => /^\s+$/.test(word) ? word : <span className="hero-title-word" key={wordIndex}>{Array.from(word).map((letter, letterIndex) => {
      const delay = Math.min(index++ * 14, 1100);
      return <span className="hero-title-letter" key={letterIndex} style={{ "--letter-delay": `${delay}ms` } as CSSProperties}>{letter}</span>;
    })}</span>);
  }
  return <h1 className="hero-title-gradient hero-title-animated" aria-label={`${first} ${second} ${last}`}>
    <span aria-hidden="true" key={`${first}-${second}-${last}`}>{letters(`${first} ${second}`)}<br />{letters(last)}</span>
  </h1>;
}
