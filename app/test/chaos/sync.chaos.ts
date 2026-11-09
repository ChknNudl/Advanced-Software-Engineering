import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import { network } from './network.js';

test('lost updates and acknowledgements recover while sockets remain connected', async () => {
  const n = await network(42);
  try {
    n.startFaults();
    await n.edit({ user: 0, at: 0, remove: 0, text: 'Alice', advance: 1 });
    await n.edit({ user: 1, at: 2, remove: 1, text: 'Bob', advance: 20 });
    await n.repair();
    assert(n.metrics.droppedUp > 0);
    assert(n.metrics.droppedDown > 0);
    assert(n.metrics.droppedAck > 0);
  } finally {
    await n.close();
  }
});

test('negative control: disabling recovery detects permanently dropped edits', async () => {
  const n = await network(42);
  try {
    n.startFaults();
    await n.edit({
      user: 0,
      at: 0,
      remove: 0,
      text: 'NEVER_DELIVERED',
      advance: 20,
    });
    await assert.rejects(n.repair(false), /durable server state lost/);
  } finally {
    await n.close();
  }
});

test('a fixed network seed reproduces text and the fault trace', async () => {
  async function run() {
    const n = await network(42);
    try {
      n.startFaults();
      for (let i = 0; i < 12; i++)
        await n.edit({
          user: i % 3,
          at: i,
          remove: i % 2,
          text: `edit${i}🙂`,
          advance: i % 5,
        });
      const text = await n.repair();
      assert(n.metrics.reordered > 0);
      assert(n.metrics.duplicated > 0);
      return { text, metrics: n.metrics };
    } finally {
      await n.close();
    }
  }
  assert.deepEqual(await run(), await run());
});

const text = fc
  .array(fc.constantFrom('a', 'Z', ' ', '\n', 'é', '你', '🙂'), {
    maxLength: 6,
  })
  .map((x) => x.join(''));
const edit = fc.record({
  user: fc.integer({ min: 0, max: 2 }),
  at: fc.nat(100),
  remove: fc.nat(5),
  text,
  advance: fc.integer({ min: 0, max: 8 }),
});
const seed = Number(process.env.CHAOS_SEED ?? 20261104);
const numRuns = Number(process.env.CHAOS_RUNS ?? 100);
if (
  !Number.isSafeInteger(seed) ||
  !Number.isSafeInteger(numRuns) ||
  numRuns < 1 ||
  numRuns > 2000
)
  throw new Error('CHAOS_SEED must be an integer; CHAOS_RUNS must be 1..2000');

test(`property-based real WebSocket chaos: ${numRuns} scenarios, seed ${seed}`, async (t) => {
  const totals = {
    droppedUp: 0,
    droppedDown: 0,
    droppedAck: 0,
    duplicated: 0,
    delayed: 0,
    reordered: 0,
    delivered: 0,
  };
  await fc.assert(
    fc.asyncProperty(
      fc.integer(),
      fc.array(edit, { minLength: 8, maxLength: 35 }),
      async (schedule, edits) => {
        const n = await network(schedule);
        try {
          n.startFaults();
          // Guaranteed traffic exercises both loss directions even if generated edits are no-ops.
          await n.edit({ user: 0, at: 0, remove: 0, text: 'A', advance: 0 });
          await n.edit({ user: 1, at: 0, remove: 1, text: 'B', advance: 20 });
          for (let i = 0; i < edits.length; i++) {
            await n.edit(edits[i]);
            if (i === Math.floor(edits.length / 2)) n.restore(1);
          }
          await n.repair();
          assert(
            n.metrics.droppedUp > 0,
            'scenario must actually drop an upstream message',
          );
          assert(
            n.metrics.droppedDown > 0,
            'scenario must actually drop a downstream message',
          );
          assert(
            n.metrics.droppedAck > 0,
            'scenario must actually lose an acknowledgement',
          );
          assert(n.metrics.delayed > 0, 'scenario must inject latency');
          for (const key of Object.keys(totals) as (keyof typeof totals)[])
            totals[key] += n.metrics[key];
        } finally {
          await n.close();
        }
      },
    ),
    {
      seed,
      numRuns,
      ...(process.env.CHAOS_PATH ? { path: process.env.CHAOS_PATH } : {}),
    },
  );
  t.diagnostic(`Fault coverage: ${JSON.stringify(totals)}`);
});
