import type { BowType, CategoryId, Finding, ResourceLink, SkillLevel } from './types';

/**
 * Curated learning links. Each URL was checked when it was added (Oct 2026);
 * YouTube search links are labelled as searches so nobody mistakes them for
 * vetted videos.
 */
interface ResourceDefinition {
  title: string;
  publisher: string;
  url: string;
  kind: ResourceLink['kind'];
  levels: SkillLevel[];
  topics: Array<CategoryId | 'general'>;
  bows?: BowType[];
}

const ALL_LEVELS: SkillLevel[] = ['beginner', 'intermediate', 'advanced', 'elite'];

export const RESOURCE_LIBRARY: Record<string, ResourceDefinition> = {
  'startarchery-shot-process': {
    title: 'What is a shot process?', publisher: 'Start Archery (Archery GB)',
    url: 'https://startarchery.co.uk/learn/what-is-a-shot-process', kind: 'article',
    levels: ['beginner', 'intermediate'], topics: ['general', 'rhythm'],
  },
  'archery360-basic-recurve': {
    title: 'Learn basic recurve form', publisher: 'Archery 360',
    url: 'https://archery360.com/2019/03/14/learn-basic-recurve-form/', kind: 'article',
    levels: ['beginner', 'intermediate'], topics: ['general', 'posture', 'release', 'followThrough'], bows: ['recurve', 'barebow', 'traditional', 'unknown'],
  },
  'archery360-alignment': {
    title: 'What is alignment?', publisher: 'Archery 360',
    url: 'https://archery360.com/2020/08/11/what-is-alignment', kind: 'article',
    levels: ALL_LEVELS, topics: ['alignment', 'posture'],
  },
  'bowintl-follow-through': {
    title: 'Recurve follow-through', publisher: 'Bow International',
    url: 'https://www.bow-international.com/features/recurve-follow-through/', kind: 'article',
    levels: ['intermediate', 'advanced', 'elite'], topics: ['followThrough', 'release'], bows: ['recurve', 'barebow', 'traditional', 'unknown'],
  },
  'ksl-shot-cycle': {
    title: 'The KSL Shot Cycle', publisher: 'KSL International Archery',
    url: 'https://kslinternationalarchery.com/Technique/KSLShotCycle/KSLShotCycle-USA.html', kind: 'article',
    levels: ['intermediate', 'advanced', 'elite'], topics: ['general', 'alignment', 'release', 'stability', 'rhythm'], bows: ['recurve', 'barebow', 'unknown'],
  },
  'wa-shootlikeme': {
    title: '#ShootLikeMe — top archers explain their technique', publisher: 'World Archery (YouTube playlist)',
    url: 'https://www.youtube.com/playlist?list=PLnGbQXzYstgExJ0RLfl0_30YHRMkroiwu', kind: 'playlist',
    levels: ['intermediate', 'advanced', 'elite'], topics: ['general', 'rhythm', 'release', 'stability'],
  },
  'wa-ellison': {
    title: '#ShootLikeMe: Brady Ellison (recurve)', publisher: 'World Archery (YouTube)',
    url: 'https://www.youtube.com/watch?v=YXiYSmPZKbY', kind: 'video',
    levels: ['intermediate', 'advanced', 'elite'], topics: ['release', 'stability', 'alignment'], bows: ['recurve', 'barebow', 'unknown'],
  },
  'wa-oh-jin-hyek': {
    title: '#ShootLikeMe: Oh Jin Hyek (recurve)', publisher: 'World Archery (YouTube)',
    url: 'https://www.youtube.com/watch?v=bee3Q9sPjzQ', kind: 'video',
    levels: ['advanced', 'elite'], topics: ['alignment', 'rhythm', 'followThrough'], bows: ['recurve', 'unknown'],
  },
  'wa-sara-lopez': {
    title: '#ShootLikeMe: Sara Lopez (compound)', publisher: 'World Archery (YouTube)',
    url: 'https://www.youtube.com/watch?v=Lu1a9K-Pm7w', kind: 'video',
    levels: ['intermediate', 'advanced', 'elite'], topics: ['general', 'release', 'stability', 'rhythm'], bows: ['compound'],
  },
  'wa-coaching': {
    title: 'Coaching manuals and courses', publisher: 'World Archery',
    url: 'https://www.worldarchery.sport/sport/education/coaching', kind: 'manual',
    levels: ALL_LEVELS, topics: ['general'],
  },
};

const SEARCH_TERMS: Record<CategoryId, string> = {
  posture: 'archery stance and posture drill',
  alignment: 'archery bow arm and draw elbow alignment drill',
  stability: 'archery holding at full draw training',
  release: 'archery back tension release drill',
  followThrough: 'archery follow through drill',
  rhythm: 'archery shot routine timing drill',
};

const CATEGORY_LABEL: Record<CategoryId, string> = {
  posture: 'stance & posture', alignment: 'draw alignment', stability: 'aiming stability',
  release: 'release', followThrough: 'follow-through', rhythm: 'rhythm & consistency',
};

export function youtubeSearch(category: CategoryId, bowType: BowType): ResourceLink {
  const prefix = bowType === 'compound' ? 'compound ' : bowType === 'barebow' ? 'barebow ' : '';
  const query = `${prefix}${SEARCH_TERMS[category]}`;
  return {
    id: `search-${category}`,
    title: `YouTube search: “${query}”`,
    publisher: 'YouTube search (not vetted)',
    url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    kind: 'search',
    reason: `More drills for ${CATEGORY_LABEL[category]}.`,
  };
}

function fitsBow(definition: ResourceDefinition, bowType: BowType): boolean {
  return !definition.bows || definition.bows.includes(bowType) || (bowType === 'unknown' && definition.bows.includes('recurve'));
}

function link(id: string, reason: string): ResourceLink {
  const definition = RESOURCE_LIBRARY[id];
  return { id, title: definition.title, publisher: definition.publisher, url: definition.url, kind: definition.kind, reason };
}

/** Resource ids that suit one finding. */
export function resourcesForCategory(category: CategoryId, level: SkillLevel, bowType: BowType): string[] {
  return Object.entries(RESOURCE_LIBRARY)
    .filter(([, definition]) => definition.topics.includes(category) && definition.levels.includes(level) && fitsBow(definition, bowType))
    .map(([id]) => id)
    .slice(0, 2);
}

/** Picks a short, level-appropriate reading/watch list driven by the focus areas. */
export function recommendResources(focus: readonly Finding[], level: SkillLevel | null, bowType: BowType): ResourceLink[] {
  const effectiveLevel = level ?? 'beginner';
  const out: ResourceLink[] = [];
  const seen = new Set<string>();
  const add = (resource: ResourceLink) => {
    if (seen.has(resource.id) || out.length >= 9) return;
    seen.add(resource.id);
    out.push(resource);
  };
  for (const finding of focus) {
    for (const id of resourcesForCategory(finding.category, effectiveLevel, bowType)) add(link(id, `Matches your focus: ${finding.title.toLowerCase()}.`));
    add(youtubeSearch(finding.category, bowType));
  }
  const general = Object.entries(RESOURCE_LIBRARY)
    .filter(([, definition]) => definition.topics.includes('general') && definition.levels.includes(effectiveLevel) && fitsBow(definition, bowType))
    .map(([id]) => id);
  for (const id of general) add(link(id, effectiveLevel === 'beginner' ? 'A good foundation for building your shot routine.' : 'Study how elite archers structure their shot.'));
  return out;
}
