/* ==========================================================================
   NexusMeet - WebRTC Engine & Front-End Application Logic (With Fixed Camera Stream)
   ========================================================================== */

(function () {
  'use strict';

  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  const state = {
    socket: null,
    roomId: '',
    userId: 'user_' + Math.random().toString(36).substring(2, 9),
    userName: '',
    isHost: false,

    localStream: null,
    screenStream: null,
    peers: {}, // { [targetSocketId]: RTCPeerConnection }
    remoteStreams: {}, // { [targetSocketId]: MediaStream }
    participantsMap: {}, // { [socketId]: participantObj }
    breakoutRoomsData: null,
    currentSubRoomId: null,
    currentSubRoomName: '',

    isAudioOn: true,
    isVideoOn: true,
    isScreenSharing: false,
    isHandRaised: false,

    layoutMode: 'grid',
    meetingStartTime: null,
    timerInterval: null,
    audioAnalyser: null,
    audioContext: null,
    unreadChatCount: 0,

    activeSidebarTab: 'participants',

    // MP4 Recording state
    isRecording: false,
    mediaRecorder: null,
    recordedChunks: [],
    recordStartTime: null,
    recordTimerInterval: null,
    recordingStream: null
  };

  const DOM = {
    // Screens
    lobbyScreen: document.getElementById('lobby-screen'),
    roomScreen: document.getElementById('room-screen'),

    // Lobby
    lobbyVideoPreview: document.getElementById('lobby-video-preview'),
    lobbyVideoOffPlaceholder: document.getElementById('lobby-video-off-placeholder'),
    lobbyAvatarPreview: document.getElementById('lobby-avatar-preview'),
    micLevelBar: document.getElementById('mic-level-bar'),
    btnToggleLobbyMic: document.getElementById('btn-toggle-lobby-mic'),
    btnToggleLobbyCam: document.getElementById('btn-toggle-lobby-cam'),
    formJoinRoom: document.getElementById('form-join-room'),
    inputUserName: document.getElementById('input-user-name'),
    inputRoomId: document.getElementById('input-room-id'),
    btnGenerateRoom: document.getElementById('btn-generate-room'),

    // Room Header
    displayRoomId: document.getElementById('display-room-id'),
    btnCopyRoomId: document.getElementById('btn-copy-room-id'),
    meetingTimer: document.getElementById('meeting-timer'),
    btnToggleLayout: document.getElementById('btn-toggle-layout'),
    textLayoutMode: document.getElementById('text-layout-mode'),
    btnInviteModal: document.getElementById('btn-invite-modal'),
    breakoutSubroomTag: document.getElementById('breakout-subroom-tag'),
    currentBreakoutName: document.getElementById('current-breakout-name'),
    btnLeaveBreakoutToMain: document.getElementById('btn-leave-breakout-to-main'),

    // Stage
    stageContainer: document.getElementById('stage-container'),
    videoGrid: document.getElementById('video-grid'),
    screenSharePresentation: document.getElementById('screen-share-presentation'),
    screenShareVideo: document.getElementById('screen-share-video'),
    screenSharePresenterName: document.getElementById('screen-share-presenter-name'),
    btnStopMyScreenShare: document.getElementById('btn-stop-my-screen-share'),

    // Sidebar
    meetingSidebar: document.getElementById('meeting-sidebar'),
    btnCloseSidebar: document.getElementById('btn-close-sidebar'),
    tabParticipants: document.getElementById('tab-participants'),
    tabChat: document.getElementById('tab-chat'),
    badgeParticipantsCount: document.getElementById('badge-participants-count'),
    badgeUnreadChat: document.getElementById('badge-unread-chat'),
    panelParticipants: document.getElementById('panel-participants'),
    panelChat: document.getElementById('panel-chat'),
    hostQuickActions: document.getElementById('host-quick-actions'),
    btnMuteAllParticipants: document.getElementById('btn-mute-all-participants'),
    participantsList: document.getElementById('participants-list'),

    // Chat
    chatMessagesContainer: document.getElementById('chat-messages-container'),
    formChatSend: document.getElementById('form-chat-send'),
    inputChatMessage: document.getElementById('input-chat-message'),

    // Toolbar Controls
    btnToggleMic: document.getElementById('btn-toggle-mic'),
    btnToggleCam: document.getElementById('btn-toggle-cam'),
    btnShareScreen: document.getElementById('btn-share-screen'),
    btnToggleRecord: document.getElementById('btn-toggle-record'),
    labelRecBtn: document.getElementById('label-rec-btn'),
    recordingStatusBadge: document.getElementById('recording-status-badge'),
    recordingTimer: document.getElementById('recording-timer'),
    btnBreakoutRooms: document.getElementById('btn-breakout-rooms'),
    btnHandRaise: document.getElementById('btn-hand-raise'),
    btnReactions: document.getElementById('btn-reactions'),
    reactionPopup: document.getElementById('reaction-popup'),
    btnToggleSidebarParticipants: document.getElementById('btn-toggle-sidebar-participants'),
    btnToggleSidebarChat: document.getElementById('btn-toggle-sidebar-chat'),
    btnLeaveRoom: document.getElementById('btn-leave-room'),

    // Modals & Banners
    modalInvite: document.getElementById('modal-invite'),
    btnCloseInviteModal: document.getElementById('btn-close-invite-modal'),
    inputInviteLink: document.getElementById('input-invite-link'),
    btnCopyInviteLink: document.getElementById('btn-copy-invite-link'),
    modalRoomIdText: document.getElementById('modal-room-id-text'),
    toastContainer: document.getElementById('toast-container'),

    // Breakout Rooms Modal
    modalBreakoutRooms: document.getElementById('modal-breakout-rooms'),
    btnCloseBreakoutModal: document.getElementById('btn-close-breakout-modal'),
    breakoutStepCreate: document.getElementById('breakout-step-create'),
    breakoutStepActive: document.getElementById('breakout-step-active'),
    selectBreakoutCount: document.getElementById('select-breakout-count'),
    btnStartBreakoutRooms: document.getElementById('btn-start-breakout-rooms'),
    breakoutRoomsPreviewList: document.getElementById('breakout-rooms-preview-list'),
    inputBroadcastText: document.getElementById('input-broadcast-text'),
    btnSendBroadcast: document.getElementById('btn-send-broadcast'),
    btnCloseAllBreakoutRooms: document.getElementById('btn-close-all-breakout-rooms'),

    // Broadcast Banner
    broadcastBanner: document.getElementById('broadcast-banner'),
    broadcastMessageText: document.getElementById('broadcast-message-text')
  };

  /* ==========================================================================
     1. INITIALIZATION & LOBBY SETUP
     ========================================================================== */
  async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      DOM.inputRoomId.value = roomParam.trim();
    } else {
      generateRandomRoomId();
    }

    DOM.inputUserName.focus();

    DOM.btnGenerateRoom.addEventListener('click', generateRandomRoomId);
    DOM.btnToggleLobbyMic.addEventListener('click', toggleLobbyMic);
    DOM.btnToggleLobbyCam.addEventListener('click', toggleLobbyCam);
    DOM.formJoinRoom.addEventListener('submit', handleJoinSubmit);

    await getLobbyMediaStream();
  }

  function generateRandomRoomId() {
    DOM.inputRoomId.value = 'marists-' + Math.floor(100000 + Math.random() * 900000);
  }

  async function getLobbyMediaStream() {
    try {
      state.localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { max: 30 } },
        audio: true
      });
      DOM.lobbyVideoPreview.srcObject = state.localStream;
      setupAudioMeter(state.localStream);
    } catch (err) {
      console.warn('[Media Error]', err);
      showToast('Không thể kết nối Camera/Microphone. Vui lòng cấp quyền trình duyệt.', 'warning');
      state.isVideoOn = false;
      state.isAudioOn = false;
      updateLobbyMediaControlsUI();
    }
  }

  function setupAudioMeter(stream) {
    if (!stream.getAudioTracks().length) return;
    try {
      state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = state.audioContext.createMediaStreamSource(stream);
      state.audioAnalyser = state.audioContext.createAnalyser();
      state.audioAnalyser.fftSize = 64;
      source.connect(state.audioAnalyser);

      const dataArray = new Uint8Array(state.audioAnalyser.frequencyBinCount);
      function checkLevel() {
        if (!state.localStream || !state.isAudioOn) {
          DOM.micLevelBar.style.width = '0%';
          return;
        }
        state.audioAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const average = sum / dataArray.length;
        const percentage = Math.min(100, Math.max(0, (average / 128) * 100));
        DOM.micLevelBar.style.width = `${percentage}%`;

        if (state.lobbyScreen.classList.contains('active')) {
          requestAnimationFrame(checkLevel);
        }
      }
      checkLevel();
    } catch (e) {
      console.error('[Audio Meter]', e);
    }
  }

  function toggleLobbyMic() {
    state.isAudioOn = !state.isAudioOn;
    if (state.localStream && state.localStream.getAudioTracks().length > 0) {
      state.localStream.getAudioTracks()[0].enabled = state.isAudioOn;
    }
    updateLobbyMediaControlsUI();
  }

  function toggleLobbyCam() {
    state.isVideoOn = !state.isVideoOn;
    if (state.localStream && state.localStream.getVideoTracks().length > 0) {
      state.localStream.getVideoTracks()[0].enabled = state.isVideoOn;
    }
    updateLobbyMediaControlsUI();
  }

  function updateLobbyMediaControlsUI() {
    const micOnIcon = DOM.btnToggleLobbyMic.querySelector('.icon-mic-on');
    const micOffIcon = DOM.btnToggleLobbyMic.querySelector('.icon-mic-off');
    if (state.isAudioOn) {
      DOM.btnToggleLobbyMic.classList.remove('off');
      micOnIcon.classList.remove('hidden');
      micOffIcon.classList.add('hidden');
    } else {
      DOM.btnToggleLobbyMic.classList.add('off');
      micOnIcon.classList.add('hidden');
      micOffIcon.classList.remove('hidden');
    }

    const camOnIcon = DOM.btnToggleLobbyCam.querySelector('.icon-cam-on');
    const camOffIcon = DOM.btnToggleLobbyCam.querySelector('.icon-cam-off');
    if (state.isVideoOn) {
      DOM.btnToggleLobbyCam.classList.remove('off');
      camOnIcon.classList.remove('hidden');
      camOffIcon.classList.add('hidden');
      DOM.lobbyVideoOffPlaceholder.classList.add('hidden');
      DOM.lobbyVideoPreview.classList.remove('hidden');
    } else {
      DOM.btnToggleLobbyCam.classList.add('off');
      camOnIcon.classList.add('hidden');
      camOffIcon.classList.remove('hidden');
      DOM.lobbyVideoOffPlaceholder.classList.remove('hidden');
      DOM.lobbyVideoPreview.classList.add('hidden');
    }
  }

  /* ==========================================================================
     2. JOINING ROOM & SIGNALING
     ========================================================================== */
  async function handleJoinSubmit(e) {
    e.preventDefault();
    const name = DOM.inputUserName.value.trim();
    const room = DOM.inputRoomId.value.trim();

    if (!name || !room) {
      showToast('Vui lòng nhập Tên và Mã phòng họp', 'error');
      return;
    }

    state.userName = name;
    state.roomId = room;
    DOM.lobbyAvatarPreview.textContent = name.charAt(0).toUpperCase();

    DOM.lobbyScreen.classList.remove('active');
    DOM.roomScreen.classList.add('active');

    DOM.displayRoomId.textContent = state.roomId;
    DOM.modalRoomIdText.textContent = state.roomId;
    DOM.inputInviteLink.value = `${window.location.origin}${window.location.pathname}?room=${state.roomId}`;

    startMeetingTimer();
    connectSocketSignaling();
    setupRoomEventListeners();
    createOrUpdateLocalVideoTile();
  }

  function connectSocketSignaling() {
    state.socket = io();

    state.socket.on('connect', () => {
      console.log('[Socket] Connected with ID:', state.socket.id);
      createOrUpdateLocalVideoTile();
      state.socket.emit('join-room', {
        roomId: state.roomId,
        userId: state.userId,
        userName: state.userName,
        isAudioOn: state.isAudioOn,
        isVideoOn: state.isVideoOn
      });
    });

    state.socket.on('room-users', ({ participants, selfInfo, breakoutActive }) => {
      state.isHost = selfInfo.isHost;
      createOrUpdateLocalVideoTile();

      if (state.isHost) {
        DOM.hostQuickActions.classList.remove('hidden');
        showToast('Bạn là Chủ phòng (Host) của cuộc họp này.', 'info');
      }

      participants.forEach(p => {
        initiatePeerConnection(p.socketId, true, p);
      });
    });

    state.socket.on('user-connected', (newUser) => {
      showToast(`${newUser.userName} vừa tham gia cuộc họp`, 'info');
    });

    state.socket.on('offer', async ({ callerSocketId, offer, callerInfo }) => {
      const peer = createPeerConnection(callerSocketId, false, callerInfo);
      await peer.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      state.socket.emit('answer', {
        targetSocketId: callerSocketId,
        answer
      });
    });

    state.socket.on('answer', async ({ responderSocketId, answer }) => {
      const peer = state.peers[responderSocketId];
      if (peer) {
        await peer.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    state.socket.on('ice-candidate', async ({ senderSocketId, candidate }) => {
      const peer = state.peers[senderSocketId];
      if (peer) {
        try {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('[WebRTC] ICE candidate error:', e);
        }
      }
    });

    state.socket.on('user-toggle-audio', ({ socketId, isAudioOn }) => {
      updateRemoteParticipantMediaState(socketId, 'audio', isAudioOn);
    });

    state.socket.on('user-toggle-video', ({ socketId, isVideoOn }) => {
      updateRemoteParticipantMediaState(socketId, 'video', isVideoOn);
    });

    state.socket.on('user-toggle-screen-share', ({ socketId, isScreenSharing, userName }) => {
      if (isScreenSharing) showToast(`${userName} đang chia sẻ màn hình`, 'info');
      else hideScreenShareView();
    });

    state.socket.on('user-hand-raised', ({ socketId, userName, isHandRaised }) => {
      if (isHandRaised) showToast(`${userName} vừa giơ tay phát biểu ✋`, 'info');
      updateParticipantHandBadge(socketId, isHandRaised);
    });

    state.socket.on('user-reaction', ({ socketId, userName, emoji }) => {
      displayFloatingReactionOnTile(socketId, emoji);
    });

    state.socket.on('chat-message', (chatData) => {
      appendChatMessage(chatData);
    });

    state.socket.on('participants-update', (participantsList) => {
      renderParticipantsList(participantsList);
    });

    // ==========================================================================
    // BREAKOUT ROOMS SOCKET EVENTS
    // ==========================================================================
    state.socket.on('assigned-to-breakout', ({ breakoutId, breakoutName }) => {
      showToast(`Bạn được phân vào '${breakoutName}'. Đang di chuyển...`, 'info');
      state.socket.emit('join-breakout-room', { roomId: state.roomId, breakoutId });
    });

    state.socket.on('entered-breakout-room', ({ breakoutId, breakoutName, subroomParticipants }) => {
      state.currentSubRoomId = breakoutId;
      state.currentSubRoomName = breakoutName;

      DOM.breakoutSubroomTag.classList.remove('hidden');
      DOM.currentBreakoutName.textContent = breakoutName;

      // Clean remote peer connections and keep local user camera intact
      removeAllRemotePeerConnections();
      createOrUpdateLocalVideoTile();

      // Connect ONLY to subroom participants
      subroomParticipants.forEach(p => {
        initiatePeerConnection(p.socketId, true, p);
      });

      showToast(`Đã tham gia '${breakoutName}'!`, 'success');
    });

    state.socket.on('user-joined-breakout', (user) => {
      showToast(`${user.userName} vừa vào nhóm thảo luận`, 'info');
    });

    state.socket.on('returned-to-main-room', ({ mainRoomParticipants }) => {
      state.currentSubRoomId = null;
      state.currentSubRoomName = '';

      DOM.breakoutSubroomTag.classList.add('hidden');
      removeAllRemotePeerConnections();
      createOrUpdateLocalVideoTile();

      mainRoomParticipants.forEach(p => {
        initiatePeerConnection(p.socketId, true, p);
      });

      showToast('Đã quay lại Phòng họp chính!', 'info');
    });

    state.socket.on('broadcast-announcement', ({ message, senderName }) => {
      showBroadcastBanner(message);
    });

    state.socket.on('force-close-breakout-rooms', () => {
      if (state.currentSubRoomId) {
        state.socket.emit('leave-breakout-room', { roomId: state.roomId });
      }
      showToast('Chủ phòng đã kết thúc tất cả các nhóm thảo luận.', 'info');
    });

    state.socket.on('breakout-rooms-status', ({ active, breakoutRooms }) => {
      state.breakoutRoomsData = breakoutRooms;
      if (state.isHost && active) {
        renderActiveBreakoutRoomsModal(breakoutRooms);
      }
    });

    state.socket.on('force-mute-audio', () => {
      if (state.isAudioOn) {
        toggleMic();
        showToast('Chủ phòng đã tắt tiếng micro của bạn.', 'warning');
      }
    });

    state.socket.on('force-kick', () => {
      showToast('Bạn đã bị chủ phòng mời rời khỏi cuộc họp.', 'error');
      setTimeout(() => window.location.reload(), 2000);
    });

    state.socket.on('promoted-to-host', () => {
      state.isHost = true;
      DOM.hostQuickActions.classList.remove('hidden');
      createOrUpdateLocalVideoTile();
      showToast('Bạn đã trở thành Chủ phòng (Host) mới.', 'info');
    });

    state.socket.on('user-disconnected', ({ socketId, userName }) => {
      showToast(`${userName} đã rời phòng`, 'info');
      removePeerConnection(socketId);
    });
  }

  /* ==========================================================================
     3. WEBRTC PEER CONNECTION MANAGEMENT
     ========================================================================== */
  function initiatePeerConnection(targetSocketId, isInitiator, participantInfo) {
    const peer = createPeerConnection(targetSocketId, isInitiator, participantInfo);
    if (isInitiator) {
      peer.onnegotiationneeded = async () => {
        try {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          state.socket.emit('offer', {
            targetSocketId,
            offer,
            callerInfo: { userName: state.userName }
          });
        } catch (e) {
          console.error('[WebRTC] Offer error:', e);
        }
      };
    }
  }

  function createPeerConnection(targetSocketId, isInitiator, participantInfo) {
    if (state.peers[targetSocketId]) {
      return state.peers[targetSocketId];
    }

    const peer = new RTCPeerConnection(RTC_CONFIG);
    state.peers[targetSocketId] = peer;

    if (state.localStream) {
      state.localStream.getTracks().forEach(track => {
        if (state.isScreenSharing && state.screenStream && track.kind === 'video') {
          const screenTrack = state.screenStream.getVideoTracks()[0];
          if (screenTrack) {
            peer.addTrack(screenTrack, state.screenStream);
            return;
          }
        }
        peer.addTrack(track, state.localStream);
      });
    }

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        state.socket.emit('ice-candidate', {
          targetSocketId,
          candidate: event.candidate
        });
      }
    };

    peer.ontrack = (event) => {
      const remoteStream = event.streams[0];
      state.remoteStreams[targetSocketId] = remoteStream;
      const userName = participantInfo ? participantInfo.userName : (state.participantsMap[targetSocketId]?.userName || 'Participant');
      addOrUpdateVideoTile(targetSocketId, userName, remoteStream, false);
    };

    return peer;
  }

  function removePeerConnection(targetSocketId) {
    if (state.peers[targetSocketId]) {
      state.peers[targetSocketId].close();
      delete state.peers[targetSocketId];
    }
    delete state.remoteStreams[targetSocketId];
    delete state.participantsMap[targetSocketId];

    const tile = document.getElementById(`tile-${targetSocketId}`);
    if (tile) tile.remove();
    updateGridColumnsCount();
  }

  function removeAllRemotePeerConnections() {
    Object.keys(state.peers).forEach(targetSocketId => {
      state.peers[targetSocketId].close();
    });
    state.peers = {};
    state.remoteStreams = {};

    // Remove all video tiles EXCEPT local user tile
    const tiles = Array.from(DOM.videoGrid.children);
    tiles.forEach(tile => {
      if (!tile.classList.contains('local-user-tile') && tile.id !== 'tile-local-user') {
        tile.remove();
      }
    });
    updateGridColumnsCount();
  }

  /* ==========================================================================
     4. VIDEO TILE & GRID DOM RENDERING
     ========================================================================== */
  function createOrUpdateLocalVideoTile() {
    let localTile = document.getElementById('tile-local-user');

    if (!localTile) {
      localTile = document.createElement('div');
      localTile.id = 'tile-local-user';
      localTile.className = 'video-tile mirror local-user-tile';
      localTile.setAttribute('data-is-local', 'true');
      localTile.innerHTML = `
        <video id="video-local-user" autoplay playsinline muted></video>
        <div id="placeholder-local-user" class="avatar-placeholder ${state.isVideoOn ? 'hidden' : ''}">
          <div class="avatar-large">${state.userName ? state.userName.charAt(0).toUpperCase() : 'U'}</div>
          <span>Camera đang tắt</span>
        </div>
        <div class="tile-footer">
          <div class="tile-user-name">
            <span id="local-tile-name-text">${state.userName} (Bạn)</span>
            ${state.isHost ? '<span class="badge-host-small">Host</span>' : ''}
          </div>
          <div class="tile-status-icons">
            <div id="icon-mic-status-local-user" class="status-icon-badge ${state.isAudioOn ? '' : 'muted'}">
              ${state.isAudioOn ? micIconSVG() : micOffIconSVG()}
            </div>
            <div id="icon-hand-local-user" class="status-icon-badge hand-raised hidden">✋</div>
          </div>
        </div>
      `;
      DOM.videoGrid.appendChild(localTile);
    } else {
      // Update name text & host badge if state updated
      const nameText = document.getElementById('local-tile-name-text');
      if (nameText) nameText.textContent = `${state.userName} (Bạn)`;
    }

    const localVideo = document.getElementById('video-local-user');
    if (localVideo && state.localStream) {
      if (localVideo.srcObject !== state.localStream) {
        localVideo.srcObject = state.localStream;
      }
      localVideo.play().catch(e => console.warn('[Video Play]', e));
    }

    const placeholder = document.getElementById('placeholder-local-user');
    if (placeholder) {
      if (state.isVideoOn) placeholder.classList.add('hidden');
      else placeholder.classList.remove('hidden');
    }

    updateGridColumnsCount();
  }

  function addOrUpdateVideoTile(socketId, userName, stream, isLocal = false) {
    if (isLocal) {
      createOrUpdateLocalVideoTile();
      return;
    }

    let tile = document.getElementById(`tile-${socketId}`);
    if (!tile) {
      tile = document.createElement('div');
      tile.id = `tile-${socketId}`;
      tile.className = 'video-tile';
      tile.innerHTML = `
        <video id="video-${socketId}" autoplay playsinline></video>
        <div id="placeholder-${socketId}" class="avatar-placeholder hidden">
          <div class="avatar-large">${userName.charAt(0).toUpperCase()}</div>
          <span>Camera đang tắt</span>
        </div>
        <div class="tile-footer">
          <div class="tile-user-name">
            <span>${userName}</span>
          </div>
          <div class="tile-status-icons">
            <div id="icon-mic-status-${socketId}" class="status-icon-badge">
              ${micIconSVG()}
            </div>
            <div id="icon-hand-${socketId}" class="status-icon-badge hand-raised hidden">✋</div>
          </div>
        </div>
      `;
      DOM.videoGrid.appendChild(tile);
    }

    const videoElem = document.getElementById(`video-${socketId}`);
    if (videoElem && stream) {
      videoElem.srcObject = stream;
      videoElem.play().catch(e => console.warn('[Remote Video Play]', e));
    }
    updateGridColumnsCount();
  }

  function updateGridColumnsCount() {
    const tileCount = DOM.videoGrid.children.length;
    DOM.videoGrid.setAttribute('data-count', tileCount);
  }

  function updateRemoteParticipantMediaState(socketId, type, isEnabled) {
    const tile = document.getElementById(`tile-${socketId}`);
    if (!tile) return;

    if (type === 'audio') {
      const micBadge = document.getElementById(`icon-mic-status-${socketId}`);
      if (micBadge) {
        micBadge.className = `status-icon-badge ${isEnabled ? '' : 'muted'}`;
        micBadge.innerHTML = isEnabled ? micIconSVG() : micOffIconSVG();
      }
    } else if (type === 'video') {
      const placeholder = document.getElementById(`placeholder-${socketId}`);
      if (placeholder) {
        if (isEnabled) placeholder.classList.add('hidden');
        else placeholder.classList.remove('hidden');
      }
    }
  }

  function updateParticipantHandBadge(socketId, isHandRaised) {
    const isLocal = socketId === (state.socket ? state.socket.id : 'local');
    const handBadgeId = isLocal ? 'icon-hand-local-user' : `icon-hand-${socketId}`;
    const handBadge = document.getElementById(handBadgeId);
    if (handBadge) {
      if (isHandRaised) handBadge.classList.remove('hidden');
      else handBadge.classList.add('hidden');
    }
  }

  function displayFloatingReactionOnTile(socketId, emoji) {
    const isLocal = socketId === (state.socket ? state.socket.id : 'local');
    const tile = isLocal ? document.getElementById('tile-local-user') : document.getElementById(`tile-${socketId}`);
    if (!tile) return;

    const reactionElem = document.createElement('div');
    reactionElem.className = 'reaction-floating';
    reactionElem.textContent = emoji;
    tile.appendChild(reactionElem);

    setTimeout(() => reactionElem.remove(), 2000);
  }

  /* ==========================================================================
     5. BREAKOUT ROOMS MANAGERIAL CONTROLS
     ========================================================================== */
  function openBreakoutModal() {
    DOM.modalBreakoutRooms.classList.remove('hidden');
    if (state.breakoutRoomsData && state.isHost) {
      DOM.breakoutStepCreate.classList.add('hidden');
      DOM.breakoutStepActive.classList.remove('hidden');
      renderActiveBreakoutRoomsModal(state.breakoutRoomsData);
    } else {
      DOM.breakoutStepCreate.classList.remove('hidden');
      DOM.breakoutStepActive.classList.add('hidden');
    }
  }

  function handleCreateBreakoutRooms() {
    if (!state.isHost) {
      showToast('Chỉ có Chủ phòng (Host) mới có thể chia nhóm.', 'warning');
      return;
    }

    const count = parseInt(DOM.selectBreakoutCount.value, 10);
    const participantsList = Object.values(state.participantsMap).filter(p => p.socketId !== state.socket.id);

    const groups = Array.from({ length: count }, (_, i) => ({
      id: `group_${i + 1}`,
      name: `Nhóm Thảo Luận ${i + 1}`,
      participants: []
    }));

    participantsList.forEach((p, index) => {
      const groupIndex = index % count;
      groups[groupIndex].participants.push(p.socketId);
    });

    state.socket.emit('create-breakout-rooms', {
      roomId: state.roomId,
      assignments: groups
    });

    DOM.breakoutStepCreate.classList.add('hidden');
    DOM.breakoutStepActive.classList.remove('hidden');
    showToast('Đã bắt đầu chia nhóm thảo luận!', 'success');
  }

  function renderActiveBreakoutRoomsModal(breakoutRooms) {
    DOM.breakoutRoomsPreviewList.innerHTML = '';

    Object.values(breakoutRooms).forEach(group => {
      const card = document.createElement('div');
      card.className = 'breakout-room-card';

      const memberNames = group.participants
        .map(sId => state.participantsMap[sId]?.userName || 'Thành viên')
        .join(', ');

      card.innerHTML = `
        <div class="room-card-info">
          <span class="room-card-title">${group.name}</span>
          <span class="room-card-members">${group.participants.length} thành viên (${memberNames || 'Trống'})</span>
        </div>
        <button class="btn-small btn-secondary btn-join-subgroup" data-id="${group.id}">Vào nhóm</button>
      `;

      DOM.breakoutRoomsPreviewList.appendChild(card);
    });

    document.querySelectorAll('.btn-join-subgroup').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const bId = e.target.getAttribute('data-id');
        state.socket.emit('join-breakout-room', { roomId: state.roomId, breakoutId: bId });
        DOM.modalBreakoutRooms.classList.add('hidden');
      });
    });
  }

  function handleSendBroadcast() {
    const text = DOM.inputBroadcastText.value.trim();
    if (!text) return;

    if (state.socket && state.isHost) {
      state.socket.emit('broadcast-breakout-message', { roomId: state.roomId, message: text });
      DOM.inputBroadcastText.value = '';
      showToast('Đã phát thông báo tới tất cả các nhóm.', 'success');
    }
  }

  function handleCloseAllBreakoutRooms() {
    if (state.isHost && state.socket) {
      state.socket.emit('close-breakout-rooms', { roomId: state.roomId });
      DOM.modalBreakoutRooms.classList.add('hidden');
    }
  }

  function showBroadcastBanner(message) {
    DOM.broadcastMessageText.textContent = message;
    DOM.broadcastBanner.classList.remove('hidden');
    setTimeout(() => {
      DOM.broadcastBanner.classList.add('hidden');
    }, 6000);
  }

  /* ==========================================================================
     6. EVENT LISTENERS & ROOM CONTROLS
     ========================================================================== */
  function setupRoomEventListeners() {
    DOM.btnToggleMic.addEventListener('click', toggleMic);
    DOM.btnToggleCam.addEventListener('click', toggleCam);
    DOM.btnShareScreen.addEventListener('click', toggleScreenShare);
    if (DOM.btnToggleRecord) {
      DOM.btnToggleRecord.addEventListener('click', toggleMP4Recording);
    }
    DOM.btnBreakoutRooms.addEventListener('click', openBreakoutModal);
    DOM.btnHandRaise.addEventListener('click', toggleHandRaise);
    DOM.btnReactions.addEventListener('click', () => DOM.reactionPopup.classList.toggle('hidden'));

    document.querySelectorAll('.btn-emoji-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const emoji = e.target.getAttribute('data-emoji');
        sendReaction(emoji);
        DOM.reactionPopup.classList.add('hidden');
      });
    });

    DOM.btnToggleSidebarParticipants.addEventListener('click', () => toggleSidebar('participants'));
    DOM.btnToggleSidebarChat.addEventListener('click', () => toggleSidebar('chat'));
    DOM.btnCloseSidebar.addEventListener('click', closeSidebar);

    DOM.tabParticipants.addEventListener('click', () => switchSidebarTab('participants'));
    DOM.tabChat.addEventListener('click', () => switchSidebarTab('chat'));

    DOM.formChatSend.addEventListener('submit', handleSendChatMessage);
    DOM.btnToggleLayout.addEventListener('click', toggleLayoutMode);
    DOM.btnLeaveRoom.addEventListener('click', leaveMeeting);

    DOM.btnCloseBreakoutModal.addEventListener('click', () => DOM.modalBreakoutRooms.classList.add('hidden'));
    DOM.btnStartBreakoutRooms.addEventListener('click', handleCreateBreakoutRooms);
    DOM.btnSendBroadcast.addEventListener('click', handleSendBroadcast);
    DOM.btnCloseAllBreakoutRooms.addEventListener('click', handleCloseAllBreakoutRooms);

    DOM.btnLeaveBreakoutToMain.addEventListener('click', () => {
      if (state.socket && state.currentSubRoomId) {
        state.socket.emit('leave-breakout-room', { roomId: state.roomId });
      }
    });

    DOM.btnInviteModal.addEventListener('click', () => DOM.modalInvite.classList.remove('hidden'));
    DOM.btnCloseInviteModal.addEventListener('click', () => DOM.modalInvite.classList.add('hidden'));
    DOM.btnCopyRoomId.addEventListener('click', copyRoomIdToClipboard);
    DOM.btnCopyInviteLink.addEventListener('click', copyInviteLinkToClipboard);

    DOM.btnStopMyScreenShare.addEventListener('click', stopScreenShare);
  }

  function toggleMic() {
    state.isAudioOn = !state.isAudioOn;
    if (state.localStream && state.localStream.getAudioTracks().length > 0) {
      state.localStream.getAudioTracks()[0].enabled = state.isAudioOn;
    }

    const micOnIcon = DOM.btnToggleMic.querySelector('.icon-mic-on');
    const micOffIcon = DOM.btnToggleMic.querySelector('.icon-mic-off');

    if (state.isAudioOn) {
      DOM.btnToggleMic.classList.remove('off');
      micOnIcon.classList.remove('hidden');
      micOffIcon.classList.add('hidden');
    } else {
      DOM.btnToggleMic.classList.add('off');
      micOnIcon.classList.add('hidden');
      micOffIcon.classList.remove('hidden');
    }

    const micBadge = document.getElementById('icon-mic-status-local-user');
    if (micBadge) {
      micBadge.className = `status-icon-badge ${state.isAudioOn ? '' : 'muted'}`;
      micBadge.innerHTML = state.isAudioOn ? micIconSVG() : micOffIconSVG();
    }

    if (state.socket) {
      state.socket.emit('toggle-audio', { roomId: state.roomId, isAudioOn: state.isAudioOn });
    }
  }

  function toggleCam() {
    state.isVideoOn = !state.isVideoOn;
    if (state.localStream && state.localStream.getVideoTracks().length > 0) {
      state.localStream.getVideoTracks()[0].enabled = state.isVideoOn;
    }

    const camOnIcon = DOM.btnToggleCam.querySelector('.icon-cam-on');
    const camOffIcon = DOM.btnToggleCam.querySelector('.icon-cam-off');

    if (state.isVideoOn) {
      DOM.btnToggleCam.classList.remove('off');
      camOnIcon.classList.remove('hidden');
      camOffIcon.classList.add('hidden');
    } else {
      DOM.btnToggleCam.classList.add('off');
      camOnIcon.classList.add('hidden');
      camOffIcon.classList.remove('hidden');
    }

    const placeholder = document.getElementById('placeholder-local-user');
    if (placeholder) {
      if (state.isVideoOn) placeholder.classList.add('hidden');
      else placeholder.classList.remove('hidden');
    }

    if (state.socket) {
      state.socket.emit('toggle-video', { roomId: state.roomId, isVideoOn: state.isVideoOn });
    }
  }

  async function toggleScreenShare() {
    if (state.isScreenSharing) {
      stopScreenShare();
      return;
    }

    try {
      state.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false
      });

      state.isScreenSharing = true;
      DOM.btnShareScreen.classList.add('active');
      DOM.screenSharePresentation.classList.remove('hidden');
      DOM.screenShareVideo.srcObject = state.screenStream;
      DOM.screenSharePresenterName.textContent = `Bạn đang chia sẻ màn hình`;
      DOM.btnStopMyScreenShare.classList.remove('hidden');

      const screenTrack = state.screenStream.getVideoTracks()[0];
      replaceVideoTrackInPeers(screenTrack);

      screenTrack.onended = () => stopScreenShare();

      if (state.socket) {
        state.socket.emit('toggle-screen-share', { roomId: state.roomId, isScreenSharing: true });
      }
    } catch (err) {
      console.warn('[Screen Share Error]', err);
    }
  }

  function stopScreenShare() {
    if (!state.isScreenSharing) return;

    if (state.screenStream) {
      state.screenStream.getTracks().forEach(track => track.stop());
      state.screenStream = null;
    }

    state.isScreenSharing = false;
    DOM.btnShareScreen.classList.remove('active');
    hideScreenShareView();

    if (state.localStream && state.localStream.getVideoTracks().length > 0) {
      const cameraTrack = state.localStream.getVideoTracks()[0];
      replaceVideoTrackInPeers(cameraTrack);
    }

    if (state.socket) {
      state.socket.emit('toggle-screen-share', { roomId: state.roomId, isScreenSharing: false });
    }
  }

  function hideScreenShareView() {
    DOM.screenSharePresentation.classList.add('hidden');
    DOM.btnStopMyScreenShare.classList.add('hidden');
  }

  function replaceVideoTrackInPeers(newTrack) {
    Object.values(state.peers).forEach(peer => {
      const senders = peer.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      if (videoSender) {
        videoSender.replaceTrack(newTrack);
      }
    });
  }

  function toggleHandRaise() {
    state.isHandRaised = !state.isHandRaised;
    if (state.isHandRaised) DOM.btnHandRaise.classList.add('active');
    else DOM.btnHandRaise.classList.remove('active');

    updateParticipantHandBadge(state.socket ? state.socket.id : 'local', state.isHandRaised);

    if (state.socket) {
      state.socket.emit('toggle-hand-raise', { roomId: state.roomId, isHandRaised: state.isHandRaised });
    }
  }

  function sendReaction(emoji) {
    displayFloatingReactionOnTile(state.socket ? state.socket.id : 'local', emoji);
    if (state.socket) {
      state.socket.emit('send-reaction', { roomId: state.roomId, emoji });
    }
  }

  function handleSendChatMessage(e) {
    e.preventDefault();
    const text = DOM.inputChatMessage.value.trim();
    if (!text) return;

    if (state.socket) {
      state.socket.emit('send-chat-message', { roomId: state.roomId, message: text });
    }
    DOM.inputChatMessage.value = '';
  }

  function appendChatMessage({ senderId, senderName, message, timestamp, isBreakout }) {
    const isSelf = senderId === (state.socket ? state.socket.id : '');
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isSelf ? 'self' : 'other'}`;

    bubble.innerHTML = `
      <div class="chat-header-info">
        <span class="chat-sender">${isSelf ? 'Bạn' : senderName} ${isBreakout ? '(Subroom)' : ''}</span>
        <span class="chat-time">${timestamp}</span>
      </div>
      <div class="chat-content">${escapeHTML(message)}</div>
    `;

    DOM.chatMessagesContainer.appendChild(bubble);
    DOM.chatMessagesContainer.scrollTop = DOM.chatMessagesContainer.scrollHeight;

    if (DOM.meetingSidebar.classList.contains('hidden') || state.activeSidebarTab !== 'chat') {
      state.unreadChatCount++;
      DOM.badgeUnreadChat.textContent = state.unreadChatCount;
      DOM.badgeUnreadChat.classList.remove('hidden');
    }
  }

  function toggleSidebar(tabName) {
    if (DOM.meetingSidebar.classList.contains('hidden')) {
      DOM.meetingSidebar.classList.remove('hidden');
      switchSidebarTab(tabName);
    } else if (state.activeSidebarTab === tabName) {
      DOM.meetingSidebar.classList.add('hidden');
    } else {
      switchSidebarTab(tabName);
    }
  }

  function closeSidebar() {
    DOM.meetingSidebar.classList.add('hidden');
  }

  function switchSidebarTab(tabName) {
    state.activeSidebarTab = tabName;
    if (tabName === 'participants') {
      DOM.tabParticipants.classList.add('active');
      DOM.tabChat.classList.remove('active');
      DOM.panelParticipants.classList.add('active');
      DOM.panelChat.classList.remove('active');
    } else {
      DOM.tabChat.classList.add('active');
      DOM.tabParticipants.classList.remove('active');
      DOM.panelChat.classList.add('active');
      DOM.panelParticipants.classList.remove('active');

      state.unreadChatCount = 0;
      DOM.badgeUnreadChat.classList.add('hidden');
    }
  }

  function renderParticipantsList(list) {
    state.participantsMap = {};
    list.forEach(p => state.participantsMap[p.socketId] = p);

    DOM.badgeParticipantsCount.textContent = list.length;
    DOM.participantsList.innerHTML = '';

    list.forEach(p => {
      const isSelf = p.socketId === (state.socket ? state.socket.id : '');
      const li = document.createElement('li');
      li.className = 'participant-item';

      li.innerHTML = `
        <div class="participant-info">
          <div class="participant-avatar">${p.userName.charAt(0).toUpperCase()}</div>
          <div class="participant-name-wrap">
            <span class="participant-name">${p.userName} ${isSelf ? '(Bạn)' : ''}</span>
            <span class="participant-sub">${p.isHost ? 'Host' : 'Thành viên'} ${p.currentSubRoom ? '• Trong Nhóm' : ''} ${p.isHandRaised ? '• ✋' : ''}</span>
          </div>
        </div>
        <div class="participant-actions">
          <span class="status-icon-badge ${p.isAudioOn ? '' : 'muted'}" style="width:24px;height:24px;">
            ${p.isAudioOn ? micIconSVG(14) : micOffIconSVG(14)}
          </span>
          ${state.isHost && !isSelf ? `
            <button class="btn-icon btn-mute-user" data-id="${p.socketId}" title="Tắt tiếng">🔇</button>
            <button class="btn-icon btn-kick-user" data-id="${p.socketId}" title="Mời ra">❌</button>
          ` : ''}
        </div>
      `;

      DOM.participantsList.appendChild(li);
    });

    if (state.isHost) {
      document.querySelectorAll('.btn-mute-user').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const targetId = e.target.getAttribute('data-id');
          state.socket.emit('host-action', { roomId: state.roomId, targetSocketId: targetId, action: 'mute' });
        });
      });

      document.querySelectorAll('.btn-kick-user').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const targetId = e.target.getAttribute('data-id');
          state.socket.emit('host-action', { roomId: state.roomId, targetSocketId: targetId, action: 'kick' });
        });
      });
    }
  }

  function startMeetingTimer() {
    state.meetingStartTime = Date.now();
    state.timerInterval = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - state.meetingStartTime) / 1000);
      const hrs = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
      const mins = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0');
      const secs = String(elapsedSec % 60).padStart(2, '0');
      DOM.meetingTimer.textContent = `${hrs}:${mins}:${secs}`;
    }, 1000);
  }

  function toggleLayoutMode() {
    state.layoutMode = state.layoutMode === 'grid' ? 'speaker' : 'grid';
    const gridIcon = DOM.btnToggleLayout.querySelector('.icon-grid-view');
    const speakerIcon = DOM.btnToggleLayout.querySelector('.icon-speaker-view');

    if (state.layoutMode === 'grid') {
      DOM.stageContainer.className = 'stage-container grid-mode';
      gridIcon.classList.remove('hidden');
      speakerIcon.classList.add('hidden');
      DOM.textLayoutMode.textContent = 'Grid View';
    } else {
      DOM.stageContainer.className = 'stage-container speaker-mode';
      gridIcon.classList.add('hidden');
      speakerIcon.classList.remove('hidden');
      DOM.textLayoutMode.textContent = 'Speaker View';
    }
  }

  function copyRoomIdToClipboard() {
    navigator.clipboard.writeText(state.roomId).then(() => {
      showToast('Đã sao chép Mã phòng họp!', 'success');
    });
  }

  function copyInviteLinkToClipboard() {
    navigator.clipboard.writeText(DOM.inputInviteLink.value).then(() => {
      showToast('Đã sao chép đường link mời họp!', 'success');
      DOM.modalInvite.classList.add('hidden');
    });
  }

  /* ==========================================================================
     7. MP4 RECORDING ENGINE
     ========================================================================== */
  function toggleMP4Recording() {
    if (state.isRecording) {
      stopMP4Recording();
    } else {
      startMP4Recording();
    }
  }

  function getSupportedMP4MimeType() {
    const types = [
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4;codecs=h264,aac',
      'video/mp4',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp9,opus',
      'video/webm'
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  }

  function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
  }

  async function startMP4Recording() {
    try {
      let videoTracks = [];
      let displayStream = null;

      // 1. Try Screen Capture if supported (Desktop & supported mobile browsers)
      if (navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function') {
        try {
          showToast('Đang chọn màn hình/cửa sổ để ghi hình MP4...', 'info');
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: { displaySurface: 'monitor', frameRate: { ideal: 30, max: 60 } },
            audio: true
          });
          if (displayStream) {
            videoTracks = displayStream.getVideoTracks();
          }
        } catch (displayErr) {
          console.warn('getDisplayMedia failed or unsupported on this device, using camera fallback:', displayErr);
        }
      }

      // 2. Mobile Device Fallback: Use Local Camera or Canvas Video Track if screen capture unavailable
      if (videoTracks.length === 0) {
        if (state.localStream && state.localStream.getVideoTracks().length > 0) {
          videoTracks = state.localStream.getVideoTracks();
          showToast('🔴 Đang ghi hình Camera & Micro cuộc họp (Chế độ Mobile)...', 'info');
        } else {
          // Generate a simple canvas placeholder track for audio-only / mobile background recording
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 480;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, 640, 480);
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(320, 200, 40, 0, 2 * Math.PI);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = '22px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Marists_meet Recording (Mobile)', 320, 280);

          const canvasStream = canvas.captureStream(15);
          videoTracks = canvasStream.getVideoTracks();
          showToast('🔴 Đang ghi âm cuộc họp MP4 (Chế độ Mobile)...', 'info');
        }
      }

      // 3. Mix Audio Sources (Local Mic + Remote Peer Audio Tracks + Display System Audio)
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const audioDestination = audioCtx.createMediaStreamDestination();

      // Add local microphone audio if available
      if (state.localStream && state.localStream.getAudioTracks().length > 0) {
        const localSource = audioCtx.createMediaStreamSource(state.localStream);
        localSource.connect(audioDestination);
      }

      // Add screen display audio if captured
      if (displayStream && displayStream.getAudioTracks().length > 0) {
        const displayAudioSource = audioCtx.createMediaStreamSource(new MediaStream(displayStream.getAudioTracks()));
        displayAudioSource.connect(audioDestination);
      }

      // Add all active remote participant audio tracks
      Object.values(state.remoteStreams).forEach(remoteStream => {
        if (remoteStream && remoteStream.getAudioTracks().length > 0) {
          try {
            const remoteSource = audioCtx.createMediaStreamSource(remoteStream);
            remoteSource.connect(audioDestination);
          } catch (e) {
            console.warn('Error connecting remote audio stream:', e);
          }
        }
      });

      // 4. Create final composite MediaStream (Video + Mixed Audio)
      const compositeStream = new MediaStream();
      videoTracks.forEach(track => compositeStream.addTrack(track));
      audioDestination.stream.getAudioTracks().forEach(track => compositeStream.addTrack(track));

      state.recordingStream = compositeStream;

      // 5. Setup MediaRecorder with best MIME type
      const mimeType = getSupportedMP4MimeType();
      const options = mimeType ? { mimeType } : {};

      state.recordedChunks = [];
      state.mediaRecorder = new MediaRecorder(compositeStream, options);

      state.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          state.recordedChunks.push(event.data);
        }
      };

      state.mediaRecorder.onstop = () => {
        saveMP4File(mimeType);
      };

      // Automatically stop recording if display screen track ends
      if (displayStream && displayStream.getVideoTracks().length > 0) {
        displayStream.getVideoTracks()[0].onended = () => {
          if (state.isRecording) {
            stopMP4Recording();
          }
        };
      }

      state.mediaRecorder.start(1000);
      state.isRecording = true;
      state.recordStartTime = Date.now();

      // 5. Update UI
      if (DOM.btnToggleRecord) {
        DOM.btnToggleRecord.classList.add('active-recording');
        const iconOff = DOM.btnToggleRecord.querySelector('.icon-rec-off');
        const iconOn = DOM.btnToggleRecord.querySelector('.icon-rec-on');
        if (iconOff) iconOff.classList.add('hidden');
        if (iconOn) iconOn.classList.remove('hidden');
        if (DOM.labelRecBtn) DOM.labelRecBtn.textContent = 'Dừng ghi';
      }

      if (DOM.recordingStatusBadge) {
        DOM.recordingStatusBadge.classList.remove('hidden');
      }

      // Start recording timer
      state.recordTimerInterval = setInterval(updateRecordTimerUI, 1000);
      updateRecordTimerUI();

      showToast('🔴 Đang ghi hình & ghi âm MP4 cuộc họp!', 'success');

    } catch (err) {
      console.error('Lỗi khởi tạo ghi hình MP4:', err);
      showToast('Không thể bắt đầu ghi hình. Vui lòng cấp quyền chia sẻ màn hình.', 'error');
    }
  }

  function updateRecordTimerUI() {
    if (!state.recordStartTime || !DOM.recordingTimer) return;
    const elapsedMs = Date.now() - state.recordStartTime;
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    DOM.recordingTimer.textContent = 
      `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function stopMP4Recording() {
    if (!state.isRecording) return;

    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }

    if (state.recordingStream) {
      state.recordingStream.getTracks().forEach(track => track.stop());
      state.recordingStream = null;
    }

    if (state.recordTimerInterval) {
      clearInterval(state.recordTimerInterval);
      state.recordTimerInterval = null;
    }

    state.isRecording = false;

    // Reset UI
    if (DOM.btnToggleRecord) {
      DOM.btnToggleRecord.classList.remove('active-recording');
      const iconOff = DOM.btnToggleRecord.querySelector('.icon-rec-off');
      const iconOn = DOM.btnToggleRecord.querySelector('.icon-rec-on');
      if (iconOff) iconOff.classList.remove('hidden');
      if (iconOn) iconOn.classList.add('hidden');
      if (DOM.labelRecBtn) DOM.labelRecBtn.textContent = 'Ghi MP4';
    }

    if (DOM.recordingStatusBadge) {
      DOM.recordingStatusBadge.classList.add('hidden');
    }
  }

  function saveMP4File(mimeType) {
    if (!state.recordedChunks || state.recordedChunks.length === 0) {
      showToast('Không có dữ liệu video được ghi lại.', 'warning');
      return;
    }

    const blobType = mimeType || 'video/mp4';

    const blob = new Blob(state.recordedChunks, { type: blobType });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = `${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`;
    const filename = `Marists_meet_Record_${state.roomId || 'Session'}_${dateStr}_${timeStr}.mp4`;

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);

    showToast(`✅ Đã tải file ghi hình (${filename}) thành công!`, 'success');
  }

  function leaveMeeting() {
    if (confirm('Bạn có chắc chắn muốn rời khỏi cuộc họp?')) {
      if (state.isRecording) {
        stopMP4Recording();
      }
      if (state.socket) state.socket.disconnect();
      window.location.href = window.location.pathname;
    }
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    DOM.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  function micIconSVG(size = 18) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`;
  }

  function micOffIconSVG(size = 18) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
