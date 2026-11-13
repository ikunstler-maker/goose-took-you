import { CHICK_COLORS, DUCT_COOLDOWN, GOOSE_SKILL_COOLDOWN, GOOSE_SKILL_SHOW_NEXT, DUCT_TIME, SHIELD_COOLDOWN, TABLET_FRESH, TABLET_RECENT, TABLET_TIME, TAG_COOLDOWN, TICK } from '../config';
import { t, type I18nKey } from '../i18n';
import { tabletStatus, tagTarget } from '../sim/professions';
import { shieldTarget } from '../sim/spirits';
import { LOCAL_PLAYER, me, type WorldState } from '../sim/world';
import { isTouch } from './touch';

/**
 * The profession's skill button (F or a tap) with its cooldown ring, the Team
 * Lead's «Табель» panel and the Streamer's siren arrow. Reads sim state only.
 */
export interface SkillUi {
  /** Cheap to call every frame. */
  update(world: WorldState): void;
  relabel(): void;
}

export function createSkillUi(handlers: { onSkill(): void }): SkillUi {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'skill';
  button.hidden = true;
  const ring = document.createElement('i');
  const name = document.createElement('strong');
  const state = document.createElement('span');
  button.append(ring, name, state);
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (!button.disabled) handlers.onSkill();
  });

  const tablet = document.createElement('div');
  tablet.id = 'tablet';
  tablet.hidden = true;

  const siren = document.createElement('div');
  siren.id = 'siren';
  siren.hidden = true;
  const sirenTitle = document.createElement('strong');
  const sirenArrow = document.createElement('i');
  const sirenText = document.createElement('span');
  siren.append(sirenTitle, sirenArrow, sirenText);

  document.body.append(button, tablet, siren);
  let shown = '';
  let tabletShown = '';
  let last: WorldState | null = null;

  const draw = (world: WorldState, force: boolean): void => {
    last = world;
    const self = me(world);
    const job =
      world.phase !== 'play' ? null : !self.alive ? (world.farmer === LOCAL_PLAYER ? 'farmer' : null) : self.role === 'goose' ? 'goose' : self.profession;
    let label = '';
    let fill = 0;
    let ready = false;
    if (job === 'analyst') {
      if (self.tag) label = t('skill.tracking', { seconds: Math.ceil(self.tag.left) });
      else if (self.skillCooldown > 0) label = t('skill.wait', { seconds: Math.ceil(self.skillCooldown) });
      else if (tagTarget(world, self) === null) label = t('skill.noTarget');
      else {
        label = t('skill.ready');
        ready = true;
      }
      fill = 1 - self.skillCooldown / TAG_COOLDOWN;
    } else if (job === 'lead') {
      if (self.tablet > 0) label = t('skill.open');
      else if (!self.charged) label = t('skill.empty');
      else {
        label = t('skill.ready');
        ready = true;
      }
      fill = self.tablet > 0 ? self.tablet / TABLET_TIME : self.charged ? 1 : 0;
    } else if (job === 'sysadmin') {
      if (self.under !== null) {
        label = t('skill.dust', { seconds: Math.max(0, Math.ceil(self.ductLeft)) });
        fill = self.ductLeft / DUCT_TIME;
      } else {
        label = self.skillCooldown > 0 ? t('skill.wait', { seconds: Math.ceil(self.skillCooldown) }) : t('skill.useE');
        fill = 1 - self.skillCooldown / DUCT_COOLDOWN;
      }
    } else if (job === 'goose') {
      if (self.glitch > 0) label = t('skill.glitch');
      else if (self.disguise !== null) {
        label = t('skill.morphing', { color: t(`look.color.${world.participants[self.disguise]!.color}` as I18nKey), seconds: Math.ceil(self.disguiseLeft) });
        // Pressed again, the mask comes off.
        ready = true;
      } else if (self.vanish > 0) label = t('skill.vanishing', { seconds: Math.ceil(self.vanish) });
      else if (self.shimmer > 0) label = t('skill.shimmer');
      else if (self.skillCooldown > 0) label = t('skill.wait', { seconds: Math.ceil(self.skillCooldown) });
      else {
        // Blind roulette by default: which skill fires is a surprise even to the Goose.
        label = GOOSE_SKILL_SHOW_NEXT ? t(`skill.next.${self.gooseNext}`) : t('skill.ready');
        ready = true;
      }
      fill = 1 - self.skillCooldown / GOOSE_SKILL_COOLDOWN;
    } else if (job === 'farmer') {
      if (self.skillCooldown > 0) label = t('skill.wait', { seconds: Math.ceil(self.skillCooldown) });
      else if (shieldTarget(world, self) === null) label = t('skill.noTarget');
      else {
        label = t('skill.ready');
        ready = true;
      }
      fill = 1 - self.skillCooldown / SHIELD_COOLDOWN;
    } else if (job === 'streamer') {
      label = t('skill.passive');
      fill = 1;
    }
    const key = [job, label, Math.round(fill * 40), isTouch()].join();
    if (key !== shown || force) {
      shown = key;
      button.hidden = job === null;
      if (job) {
        const pressable = job === 'analyst' || job === 'lead' || job === 'goose' || job === 'farmer';
        button.disabled = !ready;
        button.classList.toggle('passive', !pressable);
        name.textContent = pressable && !isTouch() ? `F · ${t(`skill.${job}`)}` : t(`skill.${job}`);
        state.textContent = label;
        ring.style.setProperty('--fill', `${Math.max(0, Math.min(1, fill)) * 360}deg`);
      }
    }

    // The tablet: one row per seat, its colour and its status.
    const open = job === 'lead' && self.tablet > 0;
    const rows = open
      ? world.participants.map((p) => `${p.color}:${tabletStatus(p, world.tick, TICK, TABLET_FRESH, TABLET_RECENT)}`).join()
      : '';
    if (rows !== tabletShown || force) {
      tabletShown = rows;
      tablet.hidden = !open;
      if (open) {
        const title = document.createElement('strong');
        title.textContent = t('tablet.title');
        const list = document.createElement('ul');
        for (const p of world.participants) {
          const status = tabletStatus(p, world.tick, TICK, TABLET_FRESH, TABLET_RECENT);
          const li = document.createElement('li');
          li.className = status;
          const swatch = document.createElement('b');
          swatch.style.background = `#${CHICK_COLORS[p.color]!.toString(16).padStart(6, '0')}`;
          const text = document.createElement('span');
          text.textContent = `${t(`look.color.${p.color}` as I18nKey)} — ${t(`tablet.${status}`)}`;
          li.append(swatch, text);
          list.append(li);
        }
        tablet.replaceChildren(title, list);
      }
    }

    // The siren: an arrow from the player's chick towards the Streamer's box.
    const s = world.phase === 'play' && self.alive ? world.siren : null;
    siren.hidden = !s;
    if (s) {
      const dx = s.x - self.x;
      const dz = s.z - self.z;
      // Camera yaw is 45°: screen-right is (+x, -z), screen-up is (-x, -z).
      const right = dx - dz;
      const up = -dx - dz;
      sirenArrow.style.transform = `rotate(${Math.atan2(right, up)}rad)`;
      if (sirenTitle.textContent === '' || force) {
        sirenTitle.textContent = t('siren.title');
        sirenText.textContent = t('siren.text');
      }
    }
  };

  return {
    update: (world) => draw(world, false),
    relabel() {
      sirenTitle.textContent = '';
      if (last) draw(last, true);
    },
  };
}
