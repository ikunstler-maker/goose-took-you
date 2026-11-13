import { CHAT_TEXT_MAX, CHICK_COLORS, PLAYER_SAY_COOLDOWN, PLAYER_SAY_MAX } from '../config';
import { t, type I18nKey } from '../i18n';
import { CHAT_NEEDS, SKIP_VOTE, type ChatKind, type ChatLine } from '../sim/meeting';
import type { RoomType } from '../sim/prefabs';
import { LOCAL_PLAYER, type WorldState } from '../sim/world';

export interface MeetingView {
  /** Redraws from the world; cheap when nothing visible changed. */
  update(world: WorldState): void;
  hide(): void;
  relabel(): void;
  /** Free text is for rooms with other people only. */
  setOnline(on: boolean): void;
}

/** Phrases offered in the quick-report bar, in order. */
const PHRASES: ChatKind[] = ['where', 'sawIn', 'sawTask', 'idle', 'saw', 'suspect', 'trust', 'defend', 'pixel', 'tablet', 'sysadmin', 'sysadminLie'];

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/** Meeting window: chat on the left, vote cards on the right, the stage timer on top. */
export function createMeetingView(handlers: {
  onVote(target: number): void;
  onSay(kind: ChatKind, about: number | null, room: RoomType | null, text?: string): void;
}): MeetingView {
  const root = document.getElementById('meeting') as HTMLElement;
  let shown = '';
  let world: WorldState | null = null;
  /** The quick report being put together: a phrase, then who it is about, then where. */
  let draft: { kind: ChatKind; about: number | null } | null = null;
  let online = false;
  /** People whose free text this player chose not to read, until the match ends. */
  const muted = new Set<number>();

  // The text field lives outside the redrawn parts, so typing survives new chat lines.
  const form = document.createElement('form');
  form.className = 'meeting-text';
  const input = document.createElement('input');
  input.maxLength = CHAT_TEXT_MAX;
  input.autocomplete = 'off';
  input.enterKeyHint = 'send';
  const sendButton = document.createElement('button');
  sendButton.type = 'submit';
  form.append(input, sendButton);
  root.append(form);
  // Typing must not walk the chick or trigger game keys.
  for (const type of ['keydown', 'keyup'] as const) input.addEventListener(type, (event) => event.stopPropagation());
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || !world?.meeting || sendButton.disabled) return;
    handlers.onSay('text', null, null, text);
    input.value = '';
  });

  const say = (kind: ChatKind, about: number | null, room: RoomType | null): void => {
    draft = null;
    handlers.onSay(kind, about, room);
  };

  root.addEventListener('click', (event) => {
    const mute = (event.target as HTMLElement).closest('button[data-mute]') as HTMLButtonElement | null;
    if (mute && world) {
      const who = Number(mute.dataset.mute);
      if (muted.has(who)) muted.delete(who);
      else muted.add(who);
      shown = '';
      update(world);
      return;
    }
    const pick = (event.target as HTMLElement).closest('button[data-say]') as HTMLButtonElement | null;
    if (pick && !pick.disabled && world?.meeting) {
      pick.blur();
      const data = pick.dataset;
      if (data.say === 'hint') {
        const line = world.meeting.hints[LOCAL_PLAYER]![Number(data.index)];
        if (line) say(line.kind, line.about, line.room);
      } else if (data.say === 'cancel') draft = null;
      else if (data.say === 'kind') {
        const kind = data.kind as ChatKind;
        if (!CHAT_NEEDS[kind].about && !CHAT_NEEDS[kind].room) say(kind, null, null);
        else draft = { kind, about: null };
      } else if (data.say === 'about' && draft) {
        const about = Number(data.about);
        if (CHAT_NEEDS[draft.kind].room) draft = { kind: draft.kind, about };
        else say(draft.kind, about, null);
      } else if (data.say === 'room' && draft) say(draft.kind, draft.about, (data.room || null) as RoomType | null);
      shown = '';
      update(world);
      return;
    }
    const button = (event.target as HTMLElement).closest('button[data-vote]') as HTMLButtonElement | null;
    if (!button || button.disabled) return;
    button.blur();
    handlers.onVote(Number(button.dataset.vote));
  });

  const name = (w: WorldState, id: number): string => t(`look.color.${w.participants[id]!.color}` as I18nKey);
  const roomName = (room: string | null): string => t((room ? `room.${room}` : 'room.corridor') as I18nKey);

  const lineText = (w: WorldState, line: ChatLine): string =>
    t(`chat.${line.kind}` as I18nKey, {
      text: line.text ?? '',
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
    // Everything but the text field is rebuilt.
    for (const child of [...root.children]) if (child !== form) child.remove();

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
      const hidden = line.kind === 'text' && muted.has(line.who);
      const who = line.ghost ? `${name(w, line.who)} (${t('chat.ghost')})` : name(w, line.who);
      const text = el('span', hidden ? 'muted' : '', hidden ? t('chat.hidden') : lineText(w, line));
      item.append(dot, el('b', '', who), text);
      if (line.ghost) item.classList.add('ghost');
      // Anyone's typed text can be put out of sight; ready-made lines cannot.
      if (line.kind === 'text' && line.who !== LOCAL_PLAYER) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chat-mute';
        button.dataset.mute = String(line.who);
        button.textContent = t(hidden ? 'chat.unmute' : 'chat.mute');
        text.append(' ', button);
      }
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
    root.insertBefore(head, form);
    root.insertBefore(body, form);
    if (self.alive && m.stage !== 'result') root.insertBefore(sayBar(w), form);
    root.append(foot);
    // Free text: online only, for the living and (among themselves) for those out of the match.
    const canType = online && m.stage !== 'result' && m.said[LOCAL_PLAYER]! < PLAYER_SAY_MAX;
    form.hidden = !canType;
    input.placeholder = t(self.alive ? 'say.text.placeholder' : 'say.text.ghost');
    sendButton.textContent = t('say.text.send');
    sendButton.disabled = cooling(w);
    chat.scrollTop = chat.scrollHeight;
    tick(w);
  };

  const chip = (cls: string, text: string, data: Record<string, string>, color: number | null = null): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `say-chip ${cls}`;
    Object.assign(button.dataset, data);
    if (color !== null) {
      const dot = el('i', 'dot');
      dot.style.background = hex(CHICK_COLORS[color]!);
      button.append(dot);
    }
    button.append(text);
    return button;
  };

  const cooling = (w: WorldState): boolean => w.meeting!.elapsed - w.meeting!.saidAt[LOCAL_PLAYER]! < PLAYER_SAY_COOLDOWN;

  /** Quick reports: true sightings on top, then phrases to fill in with a chick and a room. */
  const sayBar = (w: WorldState): HTMLElement => {
    const m = w.meeting!;
    const bar = el('section', 'meeting-say');
    if (m.said[LOCAL_PLAYER]! >= PLAYER_SAY_MAX) {
      bar.append(el('p', 'say-label', t('say.limit')));
      return bar;
    }
    const wait = cooling(w);
    const row = (label: string, chips: HTMLButtonElement[]): void => {
      const line = el('div', draft ? 'say-row pick' : 'say-row');
      line.append(el('span', 'say-label', label));
      for (const c of chips) {
        c.disabled = wait && c.dataset.say !== 'cancel';
        line.append(c);
      }
      bar.append(line);
    };
    if (!draft) {
      const hints = m.hints[LOCAL_PLAYER]!;
      if (hints.length > 0) {
        row(t('say.seen'), hints.map((line, index) => chip('hint', lineText(w, line), { say: 'hint', index: String(index) })));
      }
      row(t('say.title'), PHRASES.map((kind) => chip('', t(`say.kind.${kind}` as I18nKey), { say: 'kind', kind })));
    } else if (CHAT_NEEDS[draft.kind].about && draft.about === null) {
      const others = w.participants.filter((p) => p.id !== LOCAL_PLAYER);
      row(`${t(`say.kind.${draft.kind}` as I18nKey)} ${t('say.pick.about')}`, [
        ...others.map((p) => chip(p.alive ? '' : 'out', name(w, p.id), { say: 'about', about: String(p.id) }, p.color)),
        chip('cancel', t('say.cancel'), { say: 'cancel' }),
      ]);
    } else {
      const rooms = [...new Set(w.level.rooms.map((r) => r.type))];
      row(`${t(`say.kind.${draft.kind}` as I18nKey)} ${t('say.pick.room')}`, [
        ...rooms.map((room) => chip('', roomName(room), { say: 'room', room })),
        chip('', roomName(null), { say: 'room', room: '' }),
        chip('cancel', t('say.cancel'), { say: 'cancel' }),
      ]);
    }
    return bar;
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

  const hide = (): void => {
    root.hidden = true;
    shown = '';
    draft = null;
    input.value = '';
  };
  const update = (w: WorldState): void => {
    // A new match: everyone is readable again.
    if (world && world.level !== w.level) muted.clear();
    world = w;
    const m = w.meeting;
    if (!m) {
      hide();
      return;
    }
    // Redraw only when something on screen changed.
    const key = `${m.stage}|${m.chat.length}|${m.votes.join(',')}|${m.ejected}|${cooling(w)}|${online}|${[...muted].join()}`;
    if (key !== shown) {
      shown = key;
      draw(w);
    } else tick(w);
    root.hidden = false;
  };

  return {
    update,
    hide,
    setOnline(on) {
      online = on;
      shown = '';
    },
    relabel() {
      shown = '';
      if (world?.meeting) draw(world);
    },
  };
}
