function Hand({ fingers, crossed = false }: { fingers: number; crossed?: boolean }) {
  return <span className={`gesture-hand gesture-hand--${fingers}${crossed ? ' gesture-hand--crossed' : ''}`} aria-hidden="true">
    <span className="gesture-hand__fingers">{[0, 1, 2, 3, 4].map((index) => <i key={index} className={index < fingers ? 'is-raised' : ''} />)}</span>
    <span className="gesture-hand__palm" />
  </span>;
}

export function GestureDiagram({ score, isX = false }: { score: number; isX?: boolean }) {
  const counts = score <= 5 ? [score] : [5, score - 5];
  return <div className={`gesture-diagram${isX ? ' gesture-diagram--x' : ''}`} aria-label={isX ? 'Two open hands with crossed wrists' : `${score} raised fingers`}>
    {counts.map((count, index) => <Hand key={index} fingers={count} crossed={isX} />)}
    {isX ? <strong aria-hidden="true">X</strong> : null}
  </div>;
}
