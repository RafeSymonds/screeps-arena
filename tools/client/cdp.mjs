// Talk to the arena server through the running game client.
//
// The server authenticates with a session cookie that the client gets by
// trading a Steam ticket at /api/auth/login. Rather than handle that cookie,
// these tools attach to the client over the Chrome DevTools Protocol and run
// each request inside the client's own page, so it goes out with the client's
// session exactly as the client's own requests do.
//
// The client must be started with `--remote-debugging-port=<port>` (set it as
// the game's launch option in Steam). See tools/client/README.md.
//
// Needs a global WebSocket: Node 22+, or Node 20 with --experimental-websocket
// (bin/arena passes it).

export const API = 'https://arena.screeps.com/api';
export const PORT = Number(process.env.ARENA_DEBUG_PORT || 9222);

/** The client's main window: the page loaded from its bundled index.html. */
async function findPage(port) {
  let targets;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    targets = await res.json();
  } catch {
    throw new Error(
      `No client listening on debug port ${port}.\n` +
        'Start Screeps Arena from Steam with the launch option --remote-debugging-port=' +
        `${port} (see tools/client/README.md).`,
    );
  }
  const page =
    targets.find(t => t.type === 'page' && /\/app\/dist\//.test(t.url)) ??
    targets.find(t => t.type === 'page' && !/arena-docs/.test(t.url));
  if (!page) throw new Error(`Debug port ${port} is open but the client window was not found.`);
  return page;
}

export async function connect({ port = PORT } = {}) {
  if (typeof WebSocket === 'undefined') {
    throw new Error(
      'No global WebSocket: use Node 22+, or run Node 20 with --experimental-websocket.',
    );
  }
  const page = await findPage(port);
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('could not open the debug socket')), {
      once: true,
    });
  });

  let next = 1;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    const waiter = pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id);
    if (msg.error) waiter.reject(new Error(msg.error.message));
    else waiter.resolve(msg.result);
  });
  // Without this a dropped socket leaves every pending call hanging forever.
  const failAll = reason => {
    for (const waiter of pending.values()) waiter.reject(new Error(reason));
    pending.clear();
  };
  socket.addEventListener('close', () => failAll('debug socket closed (did the client quit?)'));
  socket.addEventListener('error', () => failAll('debug socket error'));

  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const id = next++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  /** Evaluate an async expression in the client page and return its value. */
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
      );
    }
    return result.result.value;
  }

  /**
   * Call the arena API as the signed-in client. `path` is relative to /api.
   * `form` sends multipart form data, the way the client starts games:
   * string values as fields, `{ base64, type, name }` values as files.
   * Returns parsed JSON, or throws with the status and body on failure.
   */
  // A 100-tick replay chunk of a full Spawn Strike match is ~6 MB, and a value
  // that size never comes back through Runtime.evaluate (the call just hangs).
  // So the page parks each response body and hands it over in slices.
  const SLICE = 512 * 1024;
  let requestNo = 0;

  async function api(path, { method = 'GET', body, form } = {}) {
    const key = `__arenaBridge${requestNo++}`;
    const request = JSON.stringify({ url: `${API}${path}`, method, body, form });
    const head = await evaluate(`(async () => {
      const r = ${request};
      const init = { method: r.method, credentials: 'include', headers: {} };
      if (r.form) {
        init.body = new FormData();
        for (const [k, v] of Object.entries(r.form)) {
          if (typeof v === 'string') init.body.append(k, v);
          else init.body.append(k, new Blob([Uint8Array.from(atob(v.base64), c => c.charCodeAt(0))], { type: v.type }), v.name);
        }
      } else if (r.body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(r.body);
      }
      const res = await fetch(r.url, init);
      window[${JSON.stringify(key)}] = await res.text();
      return { status: res.status, length: window[${JSON.stringify(key)}].length };
    })()`);
    let text = '';
    try {
      for (let at = 0; at < head.length; at += SLICE) {
        text += await evaluate(`window[${JSON.stringify(key)}].slice(${at}, ${at + SLICE})`);
      }
    } finally {
      await evaluate(`delete window[${JSON.stringify(key)}]`);
    }
    if (head.status < 200 || head.status >= 300) {
      throw new Error(`${method} ${path} -> ${head.status}: ${text.slice(0, 300)}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  const close = () => socket.close();
  return { api, evaluate, close, page };
}
