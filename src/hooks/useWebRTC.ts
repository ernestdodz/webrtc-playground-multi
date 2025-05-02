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
  const [isConnected, setIsConnected] = useState(false);
  const [networkTopology, setNetworkTopology] = useState<"mesh" | "star">(
    "mesh"
  );

  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<{
    [peerId: string]: {
      mediaConnection?: MediaConnection;
      dataConnection?: DataConnection;
    };
  }>({});

  // Track last time we saw each peer to handle reconnections
  const lastSeenRef = useRef<{ [peerId: string]: number }>({});

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

    // Initialize PeerJS with STUN/TURN servers
    const peer = new Peer(peerId, {
      config: {
        iceServers: [
          // Google STUN servers
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun3.l.google.com:19302" },
          { urls: "stun:stun4.l.google.com:19302" },
          // Twilio STUN server
          { urls: "stun:global.stun.twilio.com:3478" },
          // OpenRelay STUN server
          { urls: "stun:stun.openrelay.metered.ca:80" },
          // OpenRelay TURN servers (UDP)
          {
            urls: "turn:openrelay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
          {
            urls: "turn:openrelay.metered.ca:443",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
          // OpenRelay TURN servers (TCP)
          {
            urls: "turn:openrelay.metered.ca:443?transport=tcp",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
        ],
        iceCandidatePoolSize: 10,
      },
      debug: 2,
    });

    // Handle browser tab close/refresh
    const handleBeforeUnload = () => {
      // Notify peers about disconnection
      Object.entries(connectionsRef.current).forEach(
        ([peerId, connections]) => {
          if (connections.dataConnection?.open) {
            connections.dataConnection.send({
              type: "peer-disconnect",
              peerId: peer.id,
              timestamp: Date.now(),
            });
          }
        }
      );

      // Clean up connections
      Object.values(connectionsRef.current).forEach(
        ({ mediaConnection, dataConnection }) => {
          mediaConnection?.close();
          dataConnection?.close();
        }
      );

      // Close peer connection
      peer.destroy();
    };

    // Add beforeunload event listener
    window.addEventListener("beforeunload", handleBeforeUnload);

    peer.on("open", (id) => {
      console.log("My peer ID is:", id);
      peerRef.current = peer;
      setIsConnected(true);

      // Set up data connection handling
      peer.on("connection", (dataConn) => {
        handleDataConnection(dataConn);
      });

      // If joiner, connect to the creator to join the room
      if (!isCreator) {
        connectToCreator(peer, roomId, localStream);
      } else {
        // If creator, announce presence to any late joiners by broadcasting periodically
        const broadcastInterval = setInterval(() => {
          // Notify all participants about each other
          broadcastPeerList();
        }, 10000); // Every 10 seconds

        return () => clearInterval(broadcastInterval);
      }
    });

    peer.on("error", (err) => {
      console.error("PeerJS error:", err);
      setError(`Connection error: ${err.type}`);
    });

    // Handle incoming calls
    peer.on("call", (call) => {
      console.log("Receiving call from:", call.peer);

      // Answer the call with our local stream
      call.answer(localStream);

      // Handle incoming stream
      call.on("stream", (remoteStream) => {
        console.log("Received remote stream from:", call.peer);
        const isCreatorPeer = call.peer.includes("-creator");

        // Update last seen timestamp
        lastSeenRef.current[call.peer] = Date.now();

        setParticipants((prev) => {
          // If we already have this participant, don't add it again
          if (prev.some((p) => p.id === call.peer)) {
            return prev;
          }

          // For new participants, if I'm not the creator and this isn't the creator,
          // I should also establish a direct connection to this new participant
          if (
            networkTopology === "mesh" &&
            !isCreator &&
            !isCreatorPeer &&
            peerRef.current
          ) {
            // Create a bidirectional connection with this new peer
            establishPeerConnection(call.peer);
          }

          return [
            ...prev,
            {
              id: call.peer,
              stream: remoteStream,
              isCreator: isCreatorPeer,
            },
          ];
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
      // Remove beforeunload event listener
      window.removeEventListener("beforeunload", handleBeforeUnload);

      // Notify peers about disconnection
      Object.entries(connectionsRef.current).forEach(
        ([peerId, connections]) => {
          if (connections.dataConnection?.open) {
            connections.dataConnection.send({
              type: "peer-disconnect",
              peerId: peer.id,
              timestamp: Date.now(),
            });
          }
        }
      );

      // Close all connections
      Object.values(connectionsRef.current).forEach(
        ({ mediaConnection, dataConnection }) => {
          mediaConnection?.close();
          dataConnection?.close();
        }
      );

      // Close and destroy the peer
      peer.destroy();
      setIsConnected(false);
    };
  }, [localStream, roomId, isCreator]);

  // Broadcast peer list to all connected participants
  const broadcastPeerList = () => {
    if (!isCreator || !peerRef.current) return;

    // Get all current peers including the creator
    const allPeers = [peerRef.current.id, ...participants.map((p) => p.id)];

    // Send to all participants
    Object.entries(connectionsRef.current).forEach(([peerId, connections]) => {
      if (connections.dataConnection?.open) {
        connections.dataConnection.send({
          type: "peer-list",
          peers: allPeers,
          timestamp: Date.now(),
        });
      }
    });
  };

  // Establish bidirectional connection with a peer
  const establishPeerConnection = (peerId: string) => {
    if (!peerRef.current || !localStream || peerId === peerRef.current.id)
      return;

    // If we already have a connection, don't create another one
    if (connectionsRef.current[peerId]?.mediaConnection) {
      return;
    }

    console.log("Establishing bidirectional connection with:", peerId);

    // Create data connection if it doesn't exist
    if (!connectionsRef.current[peerId]?.dataConnection) {
      const dataConn = peerRef.current.connect(peerId);
      handleDataConnection(dataConn);
    }

    // Create media connection if it doesn't exist
    if (!connectionsRef.current[peerId]?.mediaConnection) {
      const call = peerRef.current.call(peerId, localStream);

      // Save the connection
      connectionsRef.current[peerId] = {
        ...connectionsRef.current[peerId],
        mediaConnection: call,
      };

      // Handle the stream
      call.on("stream", (remoteStream) => {
        console.log("Received stream from peer:", peerId);

        setParticipants((prev) => {
          // If we already have this participant, don't add it again
          if (prev.some((p) => p.id === peerId)) {
            return prev;
          }

          return [
            ...prev,
            {
              id: peerId,
              stream: remoteStream,
              isCreator: peerId.includes("-creator"),
            },
          ];
        });
      });

      call.on("close", () => {
        handlePeerDisconnection(peerId);
      });

      call.on("error", (err) => {
        console.error("Call error with peer:", peerId, err);
      });
    }
  };

  // Handle data connection to exchange peer IDs
  const handleDataConnection = (dataConn: DataConnection) => {
    dataConn.on("open", () => {
      console.log("Data connection established with:", dataConn.peer);

      // Save the data connection
      connectionsRef.current[dataConn.peer] = {
        ...connectionsRef.current[dataConn.peer],
        dataConnection: dataConn,
      };

      // If we're the creator, send a list of all current participants to the new joiner
      if (isCreator) {
        const currentPeers = [
          peerRef.current?.id,
          ...participants.map((p) => p.id),
        ].filter(Boolean);

        dataConn.send({
          type: "peer-list",
          peers: currentPeers,
          timestamp: Date.now(),
        });

        // Announce new joiner to all existing participants
        Object.entries(connectionsRef.current).forEach(
          ([existingId, connections]) => {
            if (
              existingId !== dataConn.peer &&
              connections.dataConnection?.open
            ) {
              connections.dataConnection.send({
                type: "new-peer",
                peerId: dataConn.peer,
                timestamp: Date.now(),
              });
            }
          }
        );
      }
    });

    dataConn.on("data", (data: any) => {
      console.log("Received data:", data);

      // Handle peer list from creator
      if (data.type === "peer-list" && Array.isArray(data.peers)) {
        handlePeerList(data.peers);
      }

      // Handle notification about new peer
      if (
        data.type === "new-peer" &&
        data.peerId &&
        data.peerId !== peerRef.current?.id
      ) {
        // In mesh topology, connect to the new peer
        if (networkTopology === "mesh" || isCreator) {
          establishPeerConnection(data.peerId);
        }
      }

      // Handle request for peer list (only creator responds)
      if (data.type === "request-peer-list" && isCreator) {
        const currentPeers = [
          peerRef.current?.id,
          ...participants.map((p) => p.id),
        ].filter(Boolean);

        dataConn.send({
          type: "peer-list",
          peers: currentPeers,
          timestamp: Date.now(),
        });
      }

      // Handle peer disconnect notification
      if (data.type === "peer-disconnect" && data.peerId) {
        handlePeerDisconnection(data.peerId);
      }
    });

    dataConn.on("close", () => {
      console.log("Data connection closed with:", dataConn.peer);
    });

    dataConn.on("error", (err) => {
      console.error("Data connection error:", err);
    });
  };

  // Helper function for joiners to connect to the creator
  const connectToCreator = (
    peer: Peer,
    roomId: string,
    stream: MediaStream
  ) => {
    const creatorId = `${roomId}-creator`;
    console.log("Connecting to creator:", creatorId);

    // Establish data connection with creator first
    const dataConn = peer.connect(creatorId);
    handleDataConnection(dataConn);

    // Call the creator
    const call = peer.call(creatorId, stream);

    // Save the connection
    connectionsRef.current[creatorId] = {
      dataConnection: dataConn,
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

  // Process the list of peers received from the creator
  const handlePeerList = (peerIds: string[]) => {
    if (!peerRef.current || !localStream) return;

    // Connect to each peer in the list (except ourselves and the creator)
    peerIds.forEach((peerId) => {
      // Skip if it's our own ID or it's the creator (we already connected to the creator)
      if (peerId === peerRef.current?.id || peerId.includes("-creator")) {
        return;
      }

      // In mesh topology, connect to all peers
      // In star topology, only the creator connects to all peers
      if (networkTopology === "mesh" || isCreator) {
        // Establish bidirectional connection with this peer
        establishPeerConnection(peerId);
      }
    });

    // If in star topology and I'm not the creator, disconnect from non-creator peers
    if (networkTopology === "star" && !isCreator) {
      // Identify peers that are not the creator
      const nonCreatorPeers = Object.keys(connectionsRef.current).filter(
        (id) => !id.includes("-creator")
      );

      // Disconnect from them
      nonCreatorPeers.forEach((peerId) => {
        connectionsRef.current[peerId]?.mediaConnection?.close();
        connectionsRef.current[peerId]?.dataConnection?.close();
        delete connectionsRef.current[peerId];

        // Remove from participants list
        setParticipants((prev) => prev.filter((p) => p.id !== peerId));
      });
    }
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

  // Switch between mesh and star network topologies
  const setTopology = (topology: "mesh" | "star") => {
    setNetworkTopology(topology);

    // If switching to star, disconnect non-creator peers from each other
    if (topology === "star" && !isCreator) {
      // Disconnect from all peers except the creator
      Object.entries(connectionsRef.current).forEach(
        ([peerId, connections]) => {
          if (!peerId.includes("-creator")) {
            connections.mediaConnection?.close();
            connections.dataConnection?.close();
            delete connectionsRef.current[peerId];

            // Remove from participants list
            setParticipants((prev) => prev.filter((p) => p.id === peerId));
          }
        }
      );
    }
    // If switching to mesh, reconnect to all peers
    else if (topology === "mesh" && !isCreator && peerRef.current) {
      const creatorId = `${roomId}-creator`;
      const dataConn = connectionsRef.current[creatorId]?.dataConnection;

      // Request updated peer list from creator
      if (dataConn?.open) {
        dataConn.send({
          type: "request-peer-list",
          timestamp: Date.now(),
        });
      }
    }
  };

  // Force reconnection to all peers
  const reconnectAll = () => {
    if (!peerRef.current || !localStream) return;

    if (isCreator) {
      // Creator broadcasts updated peer list
      broadcastPeerList();
    } else {
      // Non-creator reconnects to creator and requests peer list
      const creatorId = `${roomId}-creator`;

      // If creator connection is closed, reconnect
      if (!connectionsRef.current[creatorId]?.dataConnection?.open) {
        connectToCreator(peerRef.current, roomId, localStream);
      } else {
        // Request updated peer list
        connectionsRef.current[creatorId].dataConnection?.send({
          type: "request-peer-list",
          timestamp: Date.now(),
        });
      }
    }
  };

  return {
    localStream,
    participants,
    toggleAudio,
    toggleVideo,
    error,
    isConnected,
    setTopology,
    networkTopology,
    reconnectAll,
  };
};
