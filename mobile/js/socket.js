// Socket.IO 封装
let socket = null;
const convListeners = {}; // convId -> [fn]

function connectSocket() {
  if (socket) return socket;
  const token = getToken();
  if (!token) return null;
  socket = io({ auth: { token } });
  socket.on('chat:message', (msg) => {
    (convListeners[msg.conversationId] || []).forEach(fn => fn(msg));
  });
  return socket;
}

function joinConv(convId) {
  const s = connectSocket();
  if (s) s.emit('conv:join', { convId });
}

function leaveConv(convId) {
  if (socket) socket.emit('conv:leave', { convId });
}

function sendChat(convId, content) {
  const s = connectSocket();
  if (s) s.emit('chat:send', { convId, content });
}

function onChat(convId, fn) {
  convListeners[convId] = convListeners[convId] || [];
  convListeners[convId].push(fn);
}

function offChat(convId, fn) {
  convListeners[convId] = (convListeners[convId] || []).filter(f => f !== fn);
}

function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
