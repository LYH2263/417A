/**
 * SSE (Server-Sent Events) 客户端工具
 * 支持 POST 请求、自动重连、手动中止
 */

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_BASE = 1000; // 1s, 2s, 4s

export function createSSEClient({
  url,
  method = 'POST',
  payload = {},
  headers = {},
  onEvent = () => {},
  onError = () => {},
  onOpen = () => {},
  onClose = () => {},
}) {
  let abortController = new AbortController();
  let reconnectAttempts = 0;
  let closedByUser = false;
  let currentStreamId = payload.stream_id || null;
  let reconnectTimer = null;

  async function connect() {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: method !== 'GET' ? JSON.stringify(payload) : undefined,
        signal: abortController.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      onOpen && onOpen(res);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let eventType = 'message';
        let lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            const dataStr = line.slice(5).trim();
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.stream_id) {
                currentStreamId = data.stream_id;
              }
              onEvent && onEvent(eventType, data);
            } catch (e) {
              onError && onError(e);
            }
          } else if (line === '') {
            eventType = 'message';
          }
        }
      }

      onClose && onClose({ clean: !closedByUser });
    } catch (err) {
      if (err.name === 'AbortError' || closedByUser) {
        onClose && onClose({ clean: true, aborted: true });
        return;
      }

      onError && onError(err);

      // 自动重连
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts += 1;
        const delay = RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts - 1);
        onEvent && onEvent('reconnecting', {
          attempt: reconnectAttempts,
          max_attempts: MAX_RECONNECT_ATTEMPTS,
          delay_ms: delay,
          stream_id: currentStreamId,
        });
        reconnectTimer = setTimeout(() => {
          if (!closedByUser) {
            connect();
          }
        }, delay);
      } else {
        onClose && onClose({ clean: false, error: err });
      }
    }
  }

  function abort() {
    closedByUser = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    abortController.abort();
  }

  function getStreamId() {
    return currentStreamId;
  }

  // 启动连接
  connect();

  return { abort, getStreamId };
}
