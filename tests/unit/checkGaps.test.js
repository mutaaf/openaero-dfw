import { describe, it, expect } from 'vitest';
import { checkGaps, codeOnly, gapTickets, unrunFiles } from '../../scripts/check-gaps.mjs';
import { ledgerOf } from '../../scripts/gap-reporter.mjs';

const TICKETS = { '0066': 'proposed', '0143': 'ready', '0150': 'in-progress', '0074': 'shipped', '0090': 'dropped' };
const card = (title, file = 'tests/flight/x.test.js') => ({ file, title });

describe('known-gap ledger (0160)', () => {
  it('reads the ticket ids from a card title, one or several, and nothing without the tag', () => {
    expect(gapTickets('KNOWN GAP (0066): lift at 25° AoA')).toEqual(['0066']);
    expect(gapTickets('KNOWN GAP (0066, 0143): two tickets')).toEqual(['0066', '0143']);
    expect(gapTickets('f16 final: on the centreline (KNOWN GAP, 0158)')).toBeNull();
    expect(gapTickets('KNOWN GAP (66): too short')).toBeNull();
    expect(gapTickets('stalls clean near 53 KCAS')).toBeNull();
  });

  it('passes a card that names an open ticket (proposed, ready or in-progress)', () => {
    const { rows, problems } = checkGaps([
      card('KNOWN GAP (0066): a'), card('KNOWN GAP (0143): b'), card('KNOWN GAP (0150, 0066): c'),
    ], TICKETS);
    expect(problems).toEqual([]);
    expect(rows.map((r) => r.status)).toEqual(['proposed', 'ready', 'in-progress', 'proposed']);
  });

  it('fails a card whose ticket does not exist (dangling)', () => {
    const { problems } = checkGaps([card('KNOWN GAP (0999): never filed')], TICKETS);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/0999.*not in docs\/backlog/);
  });

  it('fails a card whose ticket is shipped or dropped (closed), each ticket of a pair on its own', () => {
    const { problems } = checkGaps([card('KNOWN GAP (0074): shipped'), card('KNOWN GAP (0066, 0090): half closed')], TICKETS);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/0074, which is shipped/);
    expect(problems[1]).toMatch(/0090, which is dropped/);
  });

  it('fails an it.fails card with no KNOWN GAP (NNNN) tag (untagged)', () => {
    const { rows, problems } = checkGaps([card('climbs steeper at Vx (62 KIAS) than at Vy (74 KIAS)')], TICKETS);
    expect(rows[0].status).toBe('untagged');
    expect(problems[0]).toMatch(/without a KNOWN GAP \(NNNN\) tag/);
  });

  it('refuses a ledger from a partial run that skipped a file with it.fails cards', () => {
    const sources = {
      'tests/flight/a.test.js': "it.fails('KNOWN GAP (0066): x', () => {})",
      'tests/flight/b.test.js': 'const card = (id) => (GAPS.has(id) ? it.fails : it);',
      'tests/unit/c.test.js': "it('plain', () => {})",
    };
    expect(unrunFiles(sources, ['tests/flight/a.test.js'])).toEqual(['tests/flight/b.test.js']);
    expect(unrunFiles(sources, ['tests/flight/a.test.js', 'tests/flight/b.test.js'])).toEqual([]);
  });

  it('an it.fails in a comment or a string (a fixture) is not a card a run must cover', () => {
    const sources = {
      'tests/flight/comment.test.js': "// no it.fails card is filed\n/* nor `it.fails` here */\nit('plain', () => {})",
      'tests/unit/fixture.test.js': `const s = "it.fails('KNOWN GAP (0066): x')"; const t = 'GAPS.has(id) ? it.fails : it';`,
      'tests/flight/real.test.js': "it.fails(`KNOWN GAP (0109): flaps ${f}`, () => {}) // it's real",
      'tests/flight/chained.test.js': "it.concurrent.fails('KNOWN GAP (0109): x', () => {})",
    };
    expect(unrunFiles(sources, [])).toEqual(['tests/flight/real.test.js', 'tests/flight/chained.test.js']);
    expect(codeOnly("it.fails('a // b', fn) // c")).toBe("it.fails('', fn) ");
  });

  it('names the describe in the table but reads the tag from the test\'s own title', () => {
    const { rows, problems } = checkGaps([{ file: 'f', title: 'climbs at Vx', fullName: 'KNOWN GAP (0066) > climbs at Vx' }], TICKETS);
    expect(rows[0]).toMatchObject({ status: 'untagged', title: 'KNOWN GAP (0066) > climbs at Vx' });
    expect(problems[0]).toMatch(/or file one/);
  });

  it('the reporter keeps only fails-mode tests, with their own titles and files relative to the repo', () => {
    const t = (name, fails) => ({ name, fullName: `S > ${name}`, options: { fails } });
    const mod = (path, tests) => ({ moduleId: `${process.cwd()}/${path}`, children: { allTests: () => tests } });
    const ledger = ledgerOf([
      mod('tests/flight/f16.test.js', [t('KNOWN GAP (0066): a', true), t('passes', undefined)]),
      mod('tests/unit/aero.test.js', [t('also passes', false)]),
    ]);
    expect(ledger).toEqual({
      cards: [{ file: 'tests/flight/f16.test.js', title: 'KNOWN GAP (0066): a', fullName: 'S > KNOWN GAP (0066): a' }],
      files: ['tests/flight/f16.test.js', 'tests/unit/aero.test.js'],
    });
  });
});
