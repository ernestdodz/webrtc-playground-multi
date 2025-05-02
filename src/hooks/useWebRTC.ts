import { useState, useEffect, useRef } from "react";
import Peer, { DataConnection, MediaConnection } from "peerjs";

interface Participant {
  id: string;
  stream: MediaStream;
  isCreator: boolean;
}

interface UseWebRTCProps {
  roomId: string;
  isCreator: boolean;
}

export const useWebRTC = ({ roomId, isCreator }: UseWebRTCProps) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState<string | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<{
    [peerId: string]: {
      mediaConnection?: MediaConnection;
      dataConnection?: DataConnection;
    };
  }>({});

  // Get local media stream
  useEffect(() => {
    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);
      } catch (err) {
        setError("Could not access media devices. Please check permissions.");
        console.error("Error accessing media devices:", err);
      }
    };

    getMedia();

    return () => {
      // Clean up local stream on unmount
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Initialize PeerJS connection
  useEffect(() => {
    if (!localStream || !roomId) return;

    // Generate a unique peer ID based on roomId and role
    const peerId = isCreator ? `${roomId}-creator` : `${roomId}-${Date.now()}`;

    // Initialize PeerJS with STUN servers
    const peer = new Peer(peerId, {
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:global.stun.twilio.com:3478" },
        ],
      },
      debug: 2,
    });

    peer.on("open", (id) => {
      console.log("My peer ID is:", id);
      peerRef.current = peer;

      // If joiner, connect to the creator
      if (!isCreator) {
        connectToCreator(peer, roomId, localStream);
      }
    });

    peer.on("error", (err) => {
      console.error("PeerJS error:", err);
      setError(`Connection error: ${err.type}`);
    });

    // Handle incoming calls (for creator or subsequent joiners)
    peer.on("call", (call) => {
      console.log("Receiving call from:", call.peer);

      // Answer the call with our local stream
      call.answer(localStream);

      // Handle incoming stream
      call.on("stream", (remoteStream) => {
        console.log("Received remote stream from:", call.peer);

        // Check if this participant is already in our list
        const isCreatorPeer = call.peer.includes("-creator");

        setParticipants((prev) => {
          // If we already have this participant, don't add it again
          if (prev.some((p) => p.id === call.peer)) {
            return prev;
          }

          // Add the new participant
          const newParticipant = {
            id: call.peer,
            stream: remoteStream,
            isCreator: isCreatorPeer,
          };

          // If we're the creator, call all existing participants to connect them with the new joiner
          if (isCreator && prev.length > 0) {
            prev.forEach((participant) => {
              const existingPeer = peerRef.current;
              if (existingPeer && participant.id !== call.peer) {
                const newCall = existingPeer.call(participant.id, localStream);
                connectionsRef.current[participant.id] = {
                  ...connectionsRef.current[participant.id],
                  mediaConnection: newCall,
                };
              }
            });
          }

          return [...prev, newParticipant];
        });
      });

      // Save the connection
      connectionsRef.current[call.peer] = {
        ...connectionsRef.current[call.peer],
        mediaConnection: call,
      };

      call.on("close", () => {
        handlePeerDisconnection(call.peer);
      });

      call.on("error", (err) => {
        console.error("Call error:", err);
      });
    });

    // Clean up connections when component unmounts
    return () => {
      // Close all connections
      Object.values(connectionsRef.current).forEach(
        ({ mediaConnection, dataConnection }) => {
          mediaConnection?.close();
          dataConnection?.close();
        }
      );

      // Close and destroy the peer
      peer.destroy();
    };
  }, [localStream, roomId, isCreator]);

  // Helper function for joiners to connect to the creator
  const connectToCreator = (
    peer: Peer,
    roomId: string,
    stream: MediaStream
  ) => {
    const creatorId = `${roomId}-creator`;
    console.log("Connecting to creator:", creatorId);

    // Call the creator
    const call = peer.call(creatorId, stream);

    // Save the connection
    connectionsRef.current[creatorId] = {
      ...connectionsRef.current[creatorId],
      mediaConnection: call,
    };

    // Handle the stream from the creator
    call.on("stream", (remoteStream) => {
      console.log("Received creator stream");

      setParticipants((prev) => {
        // If we already have this participant, don't add it again
        if (prev.some((p) => p.id === creatorId)) {
          return prev;
        }

        return [
          ...prev,
          {
            id: creatorId,
            stream: remoteStream,
            isCreator: true,
          },
        ];
      });
    });

    call.on("close", () => {
      handlePeerDisconnection(creatorId);
    });

    call.on("error", (err) => {
      console.error("Call error:", err);
      setError("Failed to connect to room host. Please try again.");
    });
  };

  // Handle peer disconnection
  const handlePeerDisconnection = (peerId: string) => {
    console.log("Peer disconnected:", peerId);

    setParticipants((prev) => prev.filter((p) => p.id !== peerId));

    // Clean up connections
    if (connectionsRef.current[peerId]) {
      delete connectionsRef.current[peerId];
    }
  };

  // Toggle audio
  const toggleAudio = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
    }
  };

  // Toggle video
  const toggleVideo = () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
    }
  };

  return {
    localStream,
    participants,
    toggleAudio,
    toggleVideo,
    error,
  };
};
