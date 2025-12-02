// P2P Screen Sharing App using WebRTC
// No server required - uses public STUN servers for NAT traversal

class P2PScreenShare {
    constructor() {
        this.localStream = null;
        this.peerConnection = null;
        this.dataChannel = null;
        this.isInitiator = false;
        this.pendingCandidates = [];
        
        // STUN and TURN servers for NAT traversal
        // TURN servers act as relay when direct connection fails
        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                // Free TURN servers from Open Relay Project
                {
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                // Additional free TURN server
                {
                    urls: 'turn:relay1.expressturn.com:3478',
                    username: 'efPBGNXQZVVNRJOVZO',
                    credential: 'a1Ic5e2h5XgdKlqh'
                }
            ],
            iceCandidatePoolSize: 10
        };
        
        this.initElements();
        this.initEventListeners();
        this.generateId();
    }
    
    initElements() {
        this.myIdInput = document.getElementById('myId');
        this.peerIdInput = document.getElementById('peerId');
        this.copyIdBtn = document.getElementById('copyId');
        this.connectBtn = document.getElementById('connectBtn');
        this.shareScreenBtn = document.getElementById('shareScreen');
        this.stopShareBtn = document.getElementById('stopShare');
        this.shareAudioCheck = document.getElementById('shareAudio');
        this.shareMicCheck = document.getElementById('shareMic');
        this.localVideo = document.getElementById('localVideo');
        this.remoteVideo = document.getElementById('remoteVideo');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.streamStatus = document.getElementById('streamStatus');
    }
    
    initEventListeners() {
        this.copyIdBtn.addEventListener('click', () => this.copyId());
        this.connectBtn.addEventListener('click', () => this.initiateConnection());
        this.shareScreenBtn.addEventListener('click', () => this.startScreenShare());
        this.stopShareBtn.addEventListener('click', () => this.stopScreenShare());
        
        // Handle page unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }
    
    generateId() {
        // Generate a unique ID for this peer
        const id = 'peer_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
        this.myId = id;
        this.myIdInput.value = id;
    }
    
    copyId() {
        navigator.clipboard.writeText(this.myIdInput.value).then(() => {
            this.copyIdBtn.textContent = '✅';
            setTimeout(() => {
                this.copyIdBtn.textContent = '📋';
            }, 2000);
        });
    }
    
    updateConnectionStatus(status, isConnected) {
        this.connectionStatus.textContent = status;
        this.connectionStatus.className = 'status ' + (isConnected ? 'connected' : 'disconnected');
        this.shareScreenBtn.disabled = !isConnected;
    }
    
    updateStreamStatus(status, isSharing) {
        this.streamStatus.textContent = status;
        this.streamStatus.className = 'status ' + (isSharing ? 'sharing' : '');
        this.stopShareBtn.disabled = !isSharing;
    }
    
    async initiateConnection() {
        const peerId = this.peerIdInput.value.trim();
        if (!peerId) {
            alert('Please enter your friend\'s ID');
            return;
        }
        
        this.isInitiator = true;
        this.remotePeerId = peerId;
        
        await this.createPeerConnection();
        
        // Create data channel for signaling
        this.dataChannel = this.peerConnection.createDataChannel('signaling');
        this.setupDataChannel();
        
        // Create offer
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        
        // Wait for ICE gathering to complete
        await this.waitForIceGathering();
        
        // Create connection string with offer and candidates
        const connectionData = {
            type: 'offer',
            sdp: this.peerConnection.localDescription,
            candidates: this.pendingCandidates,
            peerId: this.myId
        };
        
        const connectionString = btoa(JSON.stringify(connectionData));
        
        // Prompt user to share connection string
        const shareString = prompt(
            'Copy this connection string and send it to your friend.\n' +
            'Then paste their response string in the next prompt.\n\n' +
            'Your connection string:',
            connectionString
        );
        
        if (shareString === null) {
            this.cleanup();
            return;
        }
        
        // Wait for answer
        const answerString = prompt('Paste your friend\'s response string:');
        if (!answerString) {
            this.cleanup();
            return;
        }
        
        try {
            const answerData = JSON.parse(atob(answerString));
            
            if (answerData.type === 'answer') {
                await this.peerConnection.setRemoteDescription(answerData.sdp);
                
                // Add remote candidates
                for (const candidate of answerData.candidates) {
                    await this.peerConnection.addIceCandidate(candidate);
                }
            }
        } catch (e) {
            alert('Invalid response string. Please try again.');
            this.cleanup();
        }
    }
    
    async createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.config);
        this.pendingCandidates = [];
        
        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.pendingCandidates.push(event.candidate);
            }
        };
        
        // Handle connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            console.log('Connection state:', state);
            
            switch (state) {
                case 'connected':
                    this.updateConnectionStatus('🟢 Connected', true);
                    break;
                case 'disconnected':
                case 'failed':
                    this.updateConnectionStatus('🔴 Disconnected', false);
                    this.cleanup();
                    break;
                case 'connecting':
                    this.updateConnectionStatus('🟡 Connecting...', false);
                    break;
            }
        };
        
        // Handle incoming streams
        this.peerConnection.ontrack = (event) => {
            console.log('Received remote track:', event.track.kind);
            this.remoteVideo.srcObject = event.streams[0];
        };
        
        // Handle data channel from remote peer
        this.peerConnection.ondatachannel = (event) => {
            this.dataChannel = event.channel;
            this.setupDataChannel();
        };
    }
    
    setupDataChannel() {
        this.dataChannel.onopen = () => {
            console.log('Data channel opened');
            this.updateConnectionStatus('🟢 Connected', true);
        };
        
        this.dataChannel.onclose = () => {
            console.log('Data channel closed');
        };
        
        this.dataChannel.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'offer') {
                // Handle incoming offer for renegotiation
                await this.peerConnection.setRemoteDescription(data.sdp);
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                
                this.dataChannel.send(JSON.stringify({
                    type: 'answer',
                    sdp: this.peerConnection.localDescription
                }));
            } else if (data.type === 'answer') {
                await this.peerConnection.setRemoteDescription(data.sdp);
            } else if (data.type === 'candidate') {
                await this.peerConnection.addIceCandidate(data.candidate);
            }
        };
    }
    
    waitForIceGathering() {
        return new Promise((resolve) => {
            if (this.peerConnection.iceGatheringState === 'complete') {
                resolve();
            } else {
                let timeout;
                const checkState = () => {
                    if (this.peerConnection.iceGatheringState === 'complete') {
                        this.peerConnection.removeEventListener('icegatheringstatechange', checkState);
                        clearTimeout(timeout);
                        resolve();
                    }
                };
                this.peerConnection.addEventListener('icegatheringstatechange', checkState);
                
                // Also listen for individual candidates - resolve after no new candidates for 2 seconds
                let lastCandidateTime = Date.now();
                const candidateCheck = setInterval(() => {
                    if (Date.now() - lastCandidateTime > 2000) {
                        clearInterval(candidateCheck);
                        clearTimeout(timeout);
                        resolve();
                    }
                }, 500);
                
                this.peerConnection.addEventListener('icecandidate', () => {
                    lastCandidateTime = Date.now();
                });
                
                // Timeout after 10 seconds max
                timeout = setTimeout(() => {
                    clearInterval(candidateCheck);
                    resolve();
                }, 10000);
            }
        });
    }
    
    async startScreenShare() {
        try {
            const shareSystemAudio = this.shareAudioCheck.checked;
            const shareMic = this.shareMicCheck.checked;
            
            // Get screen stream with system audio
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always',
                    displaySurface: 'monitor'
                },
                audio: shareSystemAudio ? {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                } : false
            });
            
            // Create combined stream
            this.localStream = new MediaStream();
            
            // Add video track
            screenStream.getVideoTracks().forEach(track => {
                this.localStream.addTrack(track);
                track.onended = () => this.stopScreenShare();
            });
            
            // Add system audio if available
            if (shareSystemAudio) {
                screenStream.getAudioTracks().forEach(track => {
                    this.localStream.addTrack(track);
                });
            }
            
            // Add microphone audio if enabled
            if (shareMic) {
                try {
                    const micStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true
                        }
                    });
                    
                    micStream.getAudioTracks().forEach(track => {
                        this.localStream.addTrack(track);
                    });
                } catch (micError) {
                    console.warn('Could not access microphone:', micError);
                }
            }
            
            // Display local stream
            this.localVideo.srcObject = this.localStream;
            
            // Add tracks to peer connection
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
            
            // Renegotiate if data channel is open
            if (this.dataChannel && this.dataChannel.readyState === 'open') {
                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
                
                this.dataChannel.send(JSON.stringify({
                    type: 'offer',
                    sdp: this.peerConnection.localDescription
                }));
            }
            
            this.updateStreamStatus('🟢 Sharing Screen', true);
            this.shareScreenBtn.disabled = true;
            
        } catch (error) {
            console.error('Error starting screen share:', error);
            if (error.name !== 'NotAllowedError') {
                alert('Error starting screen share: ' + error.message);
            }
        }
    }
    
    stopScreenShare() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        this.localVideo.srcObject = null;
        this.updateStreamStatus('⚪ Not Sharing', false);
        this.shareScreenBtn.disabled = !this.peerConnection || 
            this.peerConnection.connectionState !== 'connected';
    }
    
    cleanup() {
        this.stopScreenShare();
        
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        this.updateConnectionStatus('⚪ Not Connected', false);
        this.updateStreamStatus('⚪ Not Sharing', false);
    }
}

// Handle incoming connections (when user is not the initiator)
async function handleIncomingConnection() {
    const urlParams = new URLSearchParams(window.location.search);
    const offerParam = urlParams.get('offer');
    
    if (offerParam) {
        // Handle offer from URL parameter
        try {
            const offerData = JSON.parse(atob(offerParam));
            // Process offer...
        } catch (e) {
            console.error('Invalid offer in URL');
        }
    }
}

// Initialize app
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new P2PScreenShare();
    
    // Add listener for receiving connection
    window.handleOffer = async (offerString) => {
        try {
            const offerData = JSON.parse(atob(offerString));
            
            if (offerData.type === 'offer') {
                await app.createPeerConnection();
                await app.peerConnection.setRemoteDescription(offerData.sdp);
                
                // Add remote candidates
                for (const candidate of offerData.candidates) {
                    await app.peerConnection.addIceCandidate(candidate);
                }
                
                // Create answer
                const answer = await app.peerConnection.createAnswer();
                await app.peerConnection.setLocalDescription(answer);
                
                // Wait for ICE gathering
                await app.waitForIceGathering();
                
                const answerData = {
                    type: 'answer',
                    sdp: app.peerConnection.localDescription,
                    candidates: app.pendingCandidates,
                    peerId: app.myId
                };
                
                return btoa(JSON.stringify(answerData));
            }
        } catch (e) {
            console.error('Error handling offer:', e);
            return null;
        }
    };
});

// Add a button to receive connections
document.addEventListener('DOMContentLoaded', () => {
    const connectSection = document.querySelector('.connect-section');
    
    const receiveBtn = document.createElement('button');
    receiveBtn.textContent = 'Receive Connection';
    receiveBtn.style.marginTop = '10px';
    receiveBtn.style.width = '100%';
    receiveBtn.onclick = async () => {
        const offerString = prompt('Paste the connection string from your friend:');
        if (!offerString) return;
        
        const answerString = await window.handleOffer(offerString);
        if (answerString) {
            prompt('Copy this response string and send it back to your friend:', answerString);
        } else {
            alert('Invalid connection string. Please try again.');
        }
    };
    
    connectSection.appendChild(receiveBtn);
});
