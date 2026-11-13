import { describe, expect, it } from 'vitest';
import { NEWS_FILES, NEWS_PARTNER_DELAY, TICK } from '../../config';
import { catchTile, createNews, tickNews } from './logic';

describe('news mini-game', () => {
  it('seats a bot partner after the delay', () => {
    const state = createNews(1);
    for (let t = 0; t < NEWS_PARTNER_DELAY - 0.1; t += TICK) tickNews(state, TICK);
    expect(state.phase).toBe('waiting');
    for (let i = 0; i < 12; i++) tickNews(state, TICK);
    expect(state.phase).toBe('work');
    expect(state.botPartner).toBe(true);
  });

  it('is cut with the bot: catch files, bot feeds nodes; the button itself is out in the room', () => {
    const state = createNews(5);
    let guard = 0;
    while (state.phase !== 'won' && guard++ < 60 * 120) {
      tickNews(state, TICK);
      const tile = state.tiles[0];
      if (tile) catchTile(state, tile.id);
    }
    expect(state.phase).toBe('won');
    expect(state.delivered).toBe(NEWS_FILES);
  });

  it('loses pictures that are not caught in time', () => {
    const state = createNews(2);
    for (let t = 0; t < NEWS_PARTNER_DELAY + 10; t += TICK) tickNews(state, TICK);
    expect(state.tiles.length).toBeLessThanOrEqual(3);
    expect(state.delivered).toBe(0);
    expect(catchTile(state, 99999)).toBe(false);
  });
});
