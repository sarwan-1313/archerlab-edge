import { SHORT_LEVEL } from '../../video-analysis/format';
import type { SkillLevel } from '../../video-analysis/types';

export function LevelBadge({ level, prefix }: { level: SkillLevel | null; prefix?: string }) {
  return (
    <span className={`va-level va-level--${level ?? 'none'}`}>
      <span>{prefix ? `${prefix} ` : ''}{level ? SHORT_LEVEL[level] : 'Not rated'}</span>
    </span>
  );
}
