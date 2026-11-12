import { CHICK_COLORS } from '../config';
import { t, type I18nKey } from '../i18n';
import { SKIP_VOTE, type ChatLine } from '../sim/meeting';
import { LOCAL_PLAYER, type WorldState } from '../sim/world';

export interface MeetingView {
  /** Redraws from the world; cheap when nothing visible changed. */
  update(world: WorldState): void;
  hide(): void;
  relabel(): void;
}

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/** Meeting window: chat on the left, vote cards on the right, the stage timer on top. */
export function createMeetingView(handlers: { onVote(target: number): void }): MeetingView {
  const root = document.getElementById('meeting') as HTMLElement;
  let shown = '';
  let world: WorldState | null = null;

  root.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('button[data-vote]') as HTMLButtonElement | null;
    if (!button || button.disabled) return;
    button.blur();
    handlers.onVote(Number(button.dataset.vote));
  });

  const name = (w: WorldState, id: number): string => t(`look.color.${w.participants[id]!.color}` as I18nKey);
  const roomName = (room: string | null): string => t((room ? `room.${room}` : 'room.corridor') as I18nKey);

  const lineText = (w: WorldState, line: ChatLine): string =>
    t(`chat.${line.kind}` as I18nKey, {
      about: line.about === null ? '' : name(w, line.about),
      room: roomName(line.room),
    });

  const el = (tag: string, cls: string, text = ''): HTMLElement => {
    const node = document.createElement(tag);
    node.className = cls;
    node.textContent = text;
    return node;
  };

  const draw = (w: WorldState): void => {
    const m = w.meeting!;
    const self = w.participants[LOCAL_PLAYER]!;
    const canVote = m.stage === 'vote' && self.alive && m.votes[LOCAL_PLAYER] === null;
    const showVotes = m.stage === 'result';
    root.replaceChildren();

    const head = el('header', 'meeting-head');
    head.append(
      el('h2', '', t(m.victim === null ? 'meeting.title.button' : 'meeting.title.report')),
      el('span', 'meeting-caller', t('meeting.caller', { name: name(w, m.caller) })),
      el('span', `meeting-stage stage-${m.stage}`, ''),
    );

    const chat = el('ol', 'meeting-chat');
    for (const line of m.chat) {
      const item = el('li', '');
      const dot = el('i', 'dot');
      dot.style.background = hex(CHICK_COLORS[w.participants[line.who]!.color]!);
      item.append(dot, el('b', '', name(w, line.who)), el('span', '', lineText(w, line)));
      chat.append(item);
    }

    const cards = el('div', 'meeting-cards');
    for (const p of w.participants) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'meeting-card';
      card.dataset.vote = String(p.id);
      card.disabled = !canVote || !p.alive;
      card.classList.toggle('out', !p.alive);
      card.classList.toggle('mine', m.votes[LOCAL_PLAYER] === p.id);
      card.classList.toggle('ejected', showVotes && m.ejected === p.id);
      const dot = el('i', 'dot');
      dot.style.background = hex(CHICK_COLORS[p.color]!);
      const label = p.id === LOCAL_PLAYER ? `${name(w, p.id)} (${t('meeting.you')})` : name(w, p.id);
      card.append(dot, el('b', '', label));
      if (!p.alive) card.append(el('small', '', t(p.ejected ? 'meeting.out.ejected' : 'meeting.out.packed')));
      else if (m.votes[p.id] !== null && !showVotes) card.append(el('small', 'voted', t('meeting.hasVoted')));
      if (showVotes) {
        const count = m.votes.filter((v) => v === p.id).length;
        if (count > 0) card.append(el('span', 'tally', '●'.repeat(count)));
      }
      cards.append(card);
    }

    const foot = el('footer', 'meeting-foot');
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'meeting-skip';
    skip.dataset.vote = String(SKIP_VOTE);
    skip.disabled = !canVote;
    skip.classList.toggle('mine', m.votes[LOCAL_PLAYER] === SKIP_VOTE);
    skip.textContent = t('meeting.skip');
    let hint: string;
    if (m.stage === 'result') {
      const out = m.ejected === null ? null : w.participants[m.ejected]!;
      hint = out
        ? t(out.role === 'goose' ? 'meeting.result.goose' : 'meeting.result.chick', { name: name(w, out.id) })
        : t(m.tie ? 'meeting.result.tie' : 'meeting.result.skip');
      const skipped = m.votes.filter((v) => v === SKIP_VOTE).length;
      foot.append(el('p', 'meeting-result', hint), el('span', 'meeting-skipped', t('meeting.skipped', { count: skipped })));
    } else {
      if (!self.alive) hint = t('meeting.hint.dead');
      else if (m.stage === 'talk') hint = t('meeting.hint.talk');
      else hint = m.votes[LOCAL_PLAYER] === null ? t('meeting.hint.vote') : t('meeting.hint.voted');
      foot.append(el('p', 'meeting-hint', hint), skip);
    }

    const body = el('div', 'meeting-body');
    body.append(chat, cards);
    root.append(head, body, foot);
    chat.scrollTop = chat.scrollHeight;
    tick(w);
  };

  /** The countdown changes every second; only its text is touched, so clicks are never lost. */
  let shownSeconds = -1;
  const tick = (w: WorldState): void => {
    const m = w.meeting!;
    const seconds = Math.ceil(m.timeLeft);
    const stage = root.querySelector('.meeting-stage');
    if (!stage || (seconds === shownSeconds && stage.textContent !== '')) return;
    shownSeconds = seconds;
    stage.textContent = `${t(`meeting.stage.${m.stage}` as I18nKey)} · ${t('meeting.seconds', { seconds })}`;
  };

  return {
    update(w) {
      world = w;
      const m = w.meeting;
      if (!m) {
        this.hide();
        return;
      }
      // Redraw only when something on screen changed.
      const key = `${m.stage}|${m.chat.length}|${m.votes.join(',')}|${m.ejected}`;
      if (key !== shown) {
        shown = key;
        draw(w);
      } else tick(w);
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
      shown = '';
    },
    relabel() {
      shown = '';
      if (world?.meeting) draw(world);
    },
  };
}
