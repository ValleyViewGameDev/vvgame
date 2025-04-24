import { io } from 'socket.io-client';
import gridStateManager from './GridState/GridState';

const socket = io('https://vvgame-server.onrender.com', {
  transports: ['websocket'],
  autoConnect: false, // Don't connect until explicitly told to
});


export default socket;