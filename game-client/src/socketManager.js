import { io } from 'socket.io-client';
import API_BASE from './config';

// Phase 1 (docs/refactor-plan.md): the socket carries only per-player notifications and chat.
// There is no grid-sync traffic (PCs, NPCs, tiles, resources, NPC controller) on the client.
// Keep-set: connect/disconnect, join-player-room, join-chat-rooms, send/receive-chat-message,
// mailbox/store/chat badge updates, force-refresh.

const socket = io(API_BASE, {
  transports: ['websocket'],
  autoConnect: false, // Don't connect until explicitly told to (App init calls socket.connect())
});

// 🔄 SOCKET LISTENER: connect / disconnect. Re-joins the per-player room on every (re)connect.
export function socketListenForConnectAndDisconnect(playerId, setIsSocketConnected) {
  if (!socket) return;

  const handleConnect = () => {
    console.log('📡 Socket connected/reconnected!');
    setIsSocketConnected?.(true);
    if (playerId) {
      socket.emit('join-player-room', { playerId });
    }
  };

  const handleDisconnect = () => {
    console.warn('📴 Socket disconnected.');
    setIsSocketConnected?.(false);
  };

  socket.on('connect', handleConnect);
  socket.on('disconnect', handleDisconnect);

  return () => {
    socket.off('connect', handleConnect);
    socket.off('disconnect', handleDisconnect);
  };
}

// 🔄 SOCKET LISTENER: server-requested reload (deploys, season reset).
export function socketListenForForceRefresh() {
  if (!socket) return;

  const handleForceRefresh = ({ reason } = {}) => {
    console.warn(`🔁 Server requested refresh: ${reason}`);
    window.location.reload();
  };

  socket.on('force-refresh', handleForceRefresh);

  return () => {
    socket.off('force-refresh', handleForceRefresh);
  };
}

// 🔄 SOCKET LISTENER: incoming chat messages. Chat.js is the single subscriber.
export function socketListenForChatMessages(onMessage) {
  if (!socket || typeof onMessage !== 'function') return;

  const handleIncomingChatMessage = (msg) => {
    onMessage(msg);
  };

  socket.on('receive-chat-message', handleIncomingChatMessage);

  return () => {
    socket.off('receive-chat-message', handleIncomingChatMessage);
  };
}

export function emitChatMessage({ playerId, username, message, scope, scopeId }) {
  if (!socket) return;
  socket.emit('send-chat-message', {
    playerId,
    username,
    message,
    scope,
    scopeId,
    emitterId: socket.id,
  });
}

// 🔄 SOCKET LISTENER: Consolidated badge updates (mailbox, store, chat)
export function socketListenForBadgeUpdates(currentPlayer, setBadgeState, updateBadge) {
  if (!socket || !currentPlayer) return;

  const handleBadge = ({ type, playerId, username, hasUpdate }) => {
    const isMatch =
      type === 'chat' ? true :
      (playerId && String(currentPlayer._id) === String(playerId)) ||
      (username && currentPlayer.username === username);

    if (!isMatch) return;
    updateBadge(currentPlayer, setBadgeState, type, hasUpdate);
  };

  const handleMailboxBadge = (data) => handleBadge({ ...data, type: 'mailbox' });
  const handleStoreBadge = (data) => handleBadge({ ...data, type: 'store' });
  const handleChatBadge = (data) => handleBadge({ ...data, type: 'chat' });

  socket.on('mailbox-badge-update', handleMailboxBadge);
  socket.on('store-badge-update', handleStoreBadge);
  socket.on('chat-badge-update', handleChatBadge);

  return () => {
    socket.off('mailbox-badge-update', handleMailboxBadge);
    socket.off('store-badge-update', handleStoreBadge);
    socket.off('chat-badge-update', handleChatBadge);
  };
}

export default socket;
