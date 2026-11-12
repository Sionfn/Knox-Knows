import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../app-shell/native-pages.js', import.meta.url), 'utf8');
const controller = source.slice(source.indexOf('// App Store subscriptions (iPhone app)'));

function setup(response) {
  const events = [];
  const user = { uid: 'tester', getIdToken: async () => 'tester-token' };
  const window = {
    currentUser: user,
    knoxNativeApp: true,
    addEventListener() {},
    knoxRefreshPlan: async () => { events.push('refresh'); },
    Capacitor: { Plugins: { KnoxStore: {
      async finish({ transactionIds }) { events.push('finish:' + transactionIds.join(',')); },
    } } },
  };
  runInNewContext(controller, {
    window, AbortSignal, setTimeout,
    document: { addEventListener() {} },
    fetch: async (_, { headers, body }) => {
      assert.equal(headers.Authorization, 'Bearer tester-token');
      assert.equal(JSON.parse(body).action, 'verify');
      events.push('verify');
      return response(window);
    },
  });
  return { window, user, events };
}

test('StoreKit finishes only the IDs acknowledged by the Knox server', async () => {
  const { window, events } = setup(() => Response.json({ tier: 'plus', acceptedTransactionIds: ['42'] }));
  assert.equal((await window.knoxAppleSync(['receipt'])).tier, 'plus');
  assert.deepEqual(events, ['verify', 'refresh', 'finish:42']);
});

test('server failure leaves the StoreKit transaction unfinished for restore', async () => {
  const { window, events } = setup(() => Response.json({ error: 'Unavailable' }, { status: 503 }));
  assert.equal((await window.knoxAppleSync(['receipt'])).error, 'Unavailable');
  assert.deepEqual(events, ['verify']);
});

test('a receipt response from the previous account cannot refresh the new account', async () => {
  const { window, events } = setup(w => {
    w.currentUser = { uid: 'different' };
    return Response.json({ tier: 'mega', acceptedTransactionIds: ['42'] });
  });
  assert.equal(await window.knoxAppleSync(['receipt']), null);
  assert.deepEqual(events, ['verify']);
});
