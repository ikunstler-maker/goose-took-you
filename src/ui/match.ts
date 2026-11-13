import { t, type I18nKey } from '../i18n';
import { LOCAL_PLAYER, type WorldState } from '../sim/world';
import { isTouch } from './touch';

export interface MatchScreens {
  /** Big role card at the start; fades after a few seconds. */
  showRole(world: WorldState): void;
  /** Persistent banner while the player sits packed in a box. */
  showPacked(world: WorldState): void;
  showOver(world: WorldState): void;
  hideAll(): void;
  relabel(world: WorldState): void;
}

const ROLE_CARD_SECONDS = 5;

export function createMatchScreens(handlers: { onNewMatch(): void }): MatchScreens {
  const banner = document.getElementById('banner') as HTMLElement;
  const bannerTitle = banner.querySelector('strong') as HTMLElement;
  const bannerText = banner.querySelector('span') as HTMLElement;
  const over = document.getElementById('over') as HTMLElement;
  const button = over.querySelector('button') as HTMLButtonElement;
  let bannerTimer = 0;
  let bannerKind: 'role' | 'packed' | null = null;
  button.addEventListener('click', () => {
    button.blur();
    handlers.onNewMatch();
  });

  const fillBanner = (world: WorldState): void => {
    const self = world.participants[LOCAL_PLAYER]!;
    if (bannerKind === 'role') {
      banner.classList.toggle('goose', self.role === 'goose');
      const job = self.role === 'chick' ? self.profession : null;
      bannerTitle.textContent = job ? t('role.job', { job: t(`job.${job}`) }) : t(self.role === 'goose' ? 'role.goose' : 'role.chick');
      bannerText.textContent = job
        ? t(`job.hint.${job}`, { key: isTouch() ? `«${t(`skill.${job}`)}»` : 'F' })
        : self.role === 'goose'
          ? t('role.gooseHint', { key: isTouch() ? `«${t('skill.goose')}»` : 'F' })
          : t('role.chickHint');
    } else if (bannerKind === 'packed') {
      banner.classList.remove('goose');
      bannerTitle.textContent = self.ejected ? t('meeting.out.ejected') : t('box.vacation');
      bannerText.textContent = t(self.ejected ? 'hud.ejectedYou' : 'hud.packedYou');
    }
  };

  const fillOver = (world: WorldState): void => {
    if (!world.winner) return;
    const self = world.participants[LOCAL_PLAYER]!;
    const goose = world.participants.find((p) => p.role === 'goose')!;
    const won = (world.winner === 'goose') === (self.role === 'goose');
    over.classList.toggle('goose', world.winner === 'goose');
    (over.querySelector('h2') as HTMLElement).textContent = t(world.winner === 'goose' ? 'over.goose' : 'over.chicks');
    (over.querySelector('.over-you') as HTMLElement).textContent = t(won ? 'over.youWin' : 'over.youLose');
    (over.querySelector('.over-reason') as HTMLElement).textContent = t(
      world.lostTo === 'overheat'
        ? 'over.reasonOverheat'
        : world.lostTo === 'call'
          ? 'over.reasonCall'
          : world.winner === 'goose'
            ? 'over.reasonPacked'
            : goose.alive
              ? 'over.reasonTasks'
              : 'over.reasonEjected',
    );
    // Who held which profession: told only now.
    const jobs = world.participants
      .filter((p) => p.profession !== null)
      .map((p) => `${t(`look.color.${p.color}` as I18nKey)} — ${t(`job.${p.profession!}`)}`)
      .join(', ');
    const gooseLine = t('over.gooseWas', { color: t(`look.color.${goose.color}` as I18nKey) });
    (over.querySelector('.over-goose') as HTMLElement).textContent = jobs ? `${gooseLine} ${t('over.jobs', { list: jobs })}` : gooseLine;
    button.textContent = t('over.newMatch');
  };

  return {
    showRole(world) {
      bannerKind = 'role';
      fillBanner(world);
      banner.hidden = false;
      window.clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => {
        if (bannerKind === 'role') banner.hidden = true;
      }, ROLE_CARD_SECONDS * 1000);
    },
    showPacked(world) {
      window.clearTimeout(bannerTimer);
      bannerKind = 'packed';
      fillBanner(world);
      banner.hidden = false;
    },
    showOver(world) {
      banner.hidden = true;
      bannerKind = null;
      fillOver(world);
      over.hidden = false;
    },
    hideAll() {
      window.clearTimeout(bannerTimer);
      banner.hidden = true;
      bannerKind = null;
      over.hidden = true;
    },
    relabel(world) {
      fillBanner(world);
      fillOver(world);
    },
  };
}
