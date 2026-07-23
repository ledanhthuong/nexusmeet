const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Store active room metadata & breakout rooms
// rooms: { [roomId]: { users: { [socketId]: userObj }, breakoutRooms: { [breakoutId]: { id, name, participants: [socketId] } } } }
const rooms = {};

io.on('connection', (socket) => {
  console.log(`[Connect] Socket connected: ${socket.id}`);

  // Join Main Room Event
  socket.on('join-room', ({ roomId, userId, userName, isAudioOn, isVideoOn }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.userId = userId;
    socket.userName = userName;
    socket.currentSubRoom = null;

    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: {},
        breakoutRooms: null
      };
    }

    const isHost = Object.keys(rooms[roomId].users).length === 0;

    rooms[roomId].users[socket.id] = {
      socketId: socket.id,
      userId,
      userName,
      isAudioOn: !!isAudioOn,
      isVideoOn: !!isVideoOn,
      isHandRaised: false,
      isScreenSharing: false,
      isHost,
      currentSubRoom: null
    };

    console.log(`[Join] User '${userName}' joined room '${roomId}' as ${isHost ? 'HOST' : 'PARTICIPANT'}`);

    const existingParticipants = Object.values(rooms[roomId].users).filter(p => p.socketId !== socket.id && !p.currentSubRoom);
    socket.emit('room-users', {
      participants: existingParticipants,
      selfInfo: rooms[roomId].users[socket.id],
      breakoutActive: !!rooms[roomId].breakoutRooms
    });

    socket.to(roomId).emit('user-connected', {
      socketId: socket.id,
      userId,
      userName,
      isAudioOn: !!isAudioOn,
      isVideoOn: !!isVideoOn,
      isHost
    });

    io.to(roomId).emit('participants-update', Object.values(rooms[roomId].users));
  });

  // WebRTC Signaling: Offer
  socket.on('offer', ({ targetSocketId, offer, callerInfo }) => {
    io.to(targetSocketId).emit('offer', {
      callerSocketId: socket.id,
      offer,
      callerInfo
    });
  });

  // WebRTC Signaling: Answer
  socket.on('answer', ({ targetSocketId, answer }) => {
    io.to(targetSocketId).emit('answer', {
      responderSocketId: socket.id,
      answer
    });
  });

  // WebRTC Signaling: ICE Candidate
  socket.on('ice-candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('ice-candidate', {
      senderSocketId: socket.id,
      candidate
    });
  });

  // Toggle Audio
  socket.on('toggle-audio', ({ roomId, isAudioOn }) => {
    if (rooms[roomId]?.users[socket.id]) {
      rooms[roomId].users[socket.id].isAudioOn = isAudioOn;
      const targetRoom = socket.currentSubRoom ? `${roomId}_breakout_${socket.currentSubRoom}` : roomId;
      socket.to(targetRoom).emit('user-toggle-audio', { socketId: socket.id, isAudioOn });
      io.to(roomId).emit('participants-update', Object.values(rooms[roomId].users));
    }
  });

  // Toggle Video
  socket.on('toggle-video', ({ roomId, isVideoOn }) => {
    if (rooms[roomId]?.users[socket.id]) {
      rooms[roomId].users[socket.id].isVideoOn = isVideoOn;
      const targetRoom = socket.currentSubRoom ? `${roomId}_breakout_${socket.currentSubRoom}` : roomId;
      socket.to(targetRoom).emit('user-toggle-video', { socketId: socket.id, isVideoOn });
      io.to(roomId).emit('participants-update', Object.values(rooms[roomId].users));
    }
  });

  // Toggle Screen Sharing Status
  socket.on('toggle-screen-share', ({ roomId, isScreenSharing }) => {
    if (rooms[roomId]?.users[socket.id]) {
      rooms[roomId].users[socket.id].isScreenSharing = isScreenSharing;
      const targetRoom = socket.currentSubRoom ? `${roomId}_breakout_${socket.currentSubRoom}` : roomId;
      socket.to(targetRoom).emit('user-toggle-screen-share', { socketId: socket.id, isScreenSharing, userName: socket.userName });
      io.to(roomId).emit('participants-update', Object.values(rooms[roomId].users));
    }
  });

  // Toggle Hand Raise
  socket.on('toggle-hand-raise', ({ roomId, isHandRaised }) => {
    if (rooms[roomId]?.users[socket.id]) {
      rooms[roomId].users[socket.id].isHandRaised = isHandRaised;
      const targetRoom = socket.currentSubRoom ? `${roomId}_breakout_${socket.currentSubRoom}` : roomId;
      io.to(targetRoom).emit('user-hand-raised', {
        socketId: socket.id,
        userName: socket.userName,
        isHandRaised
      });
      io.to(roomId).emit('participants-update', Object.values(rooms[roomId].users));
    }
  });

  // Emoji Reaction
  socket.on('send-reaction', ({ roomId, emoji }) => {
    const targetRoom = socket.currentSubRoom ? `${roomId}_breakout_${socket.currentSubRoom}` : roomId;
    io.to(targetRoom).emit('user-reaction', {
      socketId: socket.id,
      userName: socket.userName,
      emoji
    });
  });

  // Chat Message
  socket.on('send-chat-message', ({ roomId, message }) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const targetRoom = socket.currentSubRoom ? `${roomId}_breakout_${socket.currentSubRoom}` : roomId;
    io.to(targetRoom).emit('chat-message', {
      senderId: socket.id,
      senderName: socket.userName,
      message,
      timestamp,
      isBreakout: !!socket.currentSubRoom
    });
  });

  // Host Action (Mute participant, Kick participant)
  socket.on('host-action', ({ roomId, targetSocketId, action }) => {
    const sender = rooms[roomId]?.users[socket.id];
    if (sender && sender.isHost && rooms[roomId]?.users[targetSocketId]) {
      if (action === 'mute') {
        io.to(targetSocketId).emit('force-mute-audio');
      } else if (action === 'kick') {
        io.to(targetSocketId).emit('force-kick');
      }
    }
  });

  // ==========================================================================
  // BREAKOUT ROOMS SIGNALING
  // ==========================================================================
  socket.on('create-breakout-rooms', ({ roomId, assignments }) => {
    const sender = rooms[roomId]?.users[socket.id];
    if (!sender || !sender.isHost) return;

    rooms[roomId].breakoutRooms = {};
    assignments.forEach(group => {
      rooms[roomId].breakoutRooms[group.id] = {
        id: group.id,
        name: group.name,
        participants: group.participants
      };
    });

    console.log(`[Breakout] Created ${assignments.length} breakout rooms in '${roomId}'`);

    // Notify all participants about room assignments & open breakout state
    assignments.forEach(group => {
      group.participants.forEach(pSocketId => {
        io.to(pSocketId).emit('assigned-to-breakout', {
          breakoutId: group.id,
          breakoutName: group.name
        });
      });
    });

    io.to(roomId).emit('breakout-rooms-status', {
      active: true,
      breakoutRooms: rooms[roomId].breakoutRooms
    });
  });

  socket.on('join-breakout-room', ({ roomId, breakoutId }) => {
    if (!rooms[roomId] || !rooms[roomId].users[socket.id]) return;

    const breakoutGroup = rooms[roomId].breakoutRooms?.[breakoutId];
    if (!breakoutGroup) return;

    // Leave main room socket channel and join breakout room channel
    socket.leave(roomId);
    const breakoutChannel = `${roomId}_breakout_${breakoutId}`;
    socket.join(breakoutChannel);

    socket.currentSubRoom = breakoutId;
    rooms[roomId].users[socket.id].currentSubRoom = breakoutId;

    console.log(`[Breakout] User '${socket.userName}' joined breakout room '${breakoutGroup.name}'`);

    // Get current users inside this breakout subroom
    const subroomUsers = Object.values(rooms[roomId].users).filter(
      u => u.currentSubRoom === breakoutId && u.socketId !== socket.id
    );

    socket.emit('entered-breakout-room', {
      breakoutId,
      breakoutName: breakoutGroup.name,
      subroomParticipants: subroomUsers
    });

    // Notify others in subroom
    socket.to(breakoutChannel).emit('user-joined-breakout', {
      socketId: socket.id,
      userId: socket.userId,
      userName: socket.userName,
      isAudioOn: rooms[roomId].users[socket.id].isAudioOn,
      isVideoOn: rooms[roomId].users[socket.id].isVideoOn
    });

    io.to(roomId).emit('participants-update', Object.values(rooms[roomId].users));
  });

  socket.on('leave-breakout-room', ({ roomId }) => {
    if (!rooms[roomId] || !rooms[roomId].users[socket.id]) return;

    const oldSubRoom = socket.currentSubRoom;
    if (oldSubRoom) {
      const breakoutChannel = `${roomId}_breakout_${oldSubRoom}`;
      socket.leave(breakoutChannel);
      socket.to(breakoutChannel).emit('user-left-breakout', { socketId: socket.id, userName: socket.userName });
    }

    // Rejoin main room channel
    socket.join(roomId);
    socket.currentSubRoom = null;
    rooms[roomId].users[socket.id].currentSubRoom = null;

    console.log(`[Breakout] User '${socket.userName}' returned to Main Room`);

    // Get main room participants (those currently in main room, not in subrooms)
    const mainRoomUsers = Object.values(rooms[roomId].users).filter(
      u => !u.currentSubRoom && u.socketId !== socket.id
    );

    socket.emit('returned-to-main-room', {
      mainRoomParticipants: mainRoomUsers
    });

    socket.to(roomId).emit('user-connected', {
      socketId: socket.id,
      userId: socket.userId,
      userName: socket.userName,
      isAudioOn: rooms[roomId].users[socket.id].isAudioOn,
      isVideoOn: rooms[roomId].users[socket.id].isVideoOn
    });

    io.to(roomId).emit('participants-update', Object.values(rooms[roomId].users));
  });

  socket.on('broadcast-breakout-message', ({ roomId, message }) => {
    const sender = rooms[roomId]?.users[socket.id];
    if (sender && sender.isHost) {
      io.to(roomId).emit('broadcast-announcement', {
        message,
        senderName: socket.userName
      });
      if (rooms[roomId].breakoutRooms) {
        Object.keys(rooms[roomId].breakoutRooms).forEach(bId => {
          io.to(`${roomId}_breakout_${bId}`).emit('broadcast-announcement', {
            message,
            senderName: socket.userName
          });
        });
      }
    }
  });

  socket.on('close-breakout-rooms', ({ roomId }) => {
    const sender = rooms[roomId]?.users[socket.id];
    if (sender && sender.isHost) {
      rooms[roomId].breakoutRooms = null;
      console.log(`[Breakout] Host closed all breakout rooms in '${roomId}'`);

      io.to(roomId).emit('force-close-breakout-rooms');
      io.to(roomId).emit('breakout-rooms-status', { active: false, breakoutRooms: null });
    }
  });

  // Handle Disconnect
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    console.log(`[Disconnect] Socket disconnected: ${socket.id}`);

    if (roomId && rooms[roomId]?.users[socket.id]) {
      const leavingUser = rooms[roomId].users[socket.id];
      delete rooms[roomId].users[socket.id];

      const targetChannel = socket.currentSubRoom ? `${roomId}_breakout_${socket.currentSubRoom}` : roomId;
      socket.to(targetChannel).emit('user-disconnected', {
        socketId: socket.id,
        userName: leavingUser ? leavingUser.userName : 'A participant'
      });

      const remainingSockets = Object.keys(rooms[roomId].users);
      if (leavingUser?.isHost && remainingSockets.length > 0) {
        const newHostSocketId = remainingSockets[0];
        rooms[roomId].users[newHostSocketId].isHost = true;
        io.to(newHostSocketId).emit('promoted-to-host');
      }

      if (remainingSockets.length === 0) {
        delete rooms[roomId];
      } else {
        io.to(roomId).emit('participants-update', Object.values(rooms[roomId].users));
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(` Zoom Clone Server running on http://localhost:${PORT}`);
  console.log(`=================================================`);
});
