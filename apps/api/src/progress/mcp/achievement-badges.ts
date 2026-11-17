import type { AchievementEntry } from '../achievement.service';

/** As conquistas como cartão de selos (prancha IA-Cartoes, #384). */
export function achievementBadges(conquistas: Pick<AchievementEntry, 'title' | 'unlockedAt'>[]) {
  const badges = conquistas.map((c) => ({ title: c.title, unlocked: c.unlockedAt !== null }));
  return {
    kind: 'badges',
    label: 'Conquistas',
    unlocked: badges.filter((b) => b.unlocked).length,
    total: badges.length,
    badges,
  };
}
