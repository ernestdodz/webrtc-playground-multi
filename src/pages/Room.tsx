import React, { useEffect, useRef, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import {
  Video,
  Mic,
  MicOff,
  VideoOff,
  Phone,
  Copy,
  Users,
  Send,
  Share2,
  Link,
  MessageSquare,
  X,
} from "lucide-react";
import { useWebRTC } from "../hooks/useWebRTC";

interface Participant {
  id: string;
  stream: MediaStream;
  isCreator: boolean;
}

interface ChatMessage {
  sender: string;
  text: string;
  timestamp: number;
  isFromMe: boolean;
}

const Room: React.FC = () => {
  // Existing state
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const isCreator =
    new URLSearchParams(location.search).get("isCreator") === "true";
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [showShareOptions, setShowShareOptions] = useState(false);

  // Chat state
  const [message, setMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const {
    localStream,
    participants,
    toggleAudio,
    toggleVideo,
    error,
    sendDataToAll,
  } = useWebRTC({
    roomId: roomId || "",
    isCreator,
    onDataReceived: handleDataReceived,
  });

  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Handle received data (for chat)
  function handleDataReceived(data: any) {
    if (data.type === "chat-message") {
      const newMessage: ChatMessage = {
        sender: data.sender,
        text: data.text,
        timestamp: data.timestamp,
        isFromMe: false,
      };
      setChatMessages((prev) => [...prev, newMessage]);
    }
  }

  // Send chat message
  const sendChatMessage = () => {
    if (!message.trim()) return;

    // Create message object
    const chatMessage = {
      type: "chat-message",
      sender: isCreator ? "Host" : "You",
      text: message,
      timestamp: Date.now(),
    };

    // Send to all peers
    sendDataToAll(chatMessage);

    // Add to local chat
    setChatMessages((prev) => [...prev, { ...chatMessage, isFromMe: true }]);

    // Clear input
    setMessage("");
  };

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  // Existing useEffects and handlers
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (error) {
      alert(`Error: ${error}. Redirecting to home page.`);
      navigate("/");
    }
  }, [error, navigate]);

  const handleToggleMic = () => {
    toggleAudio();
    setIsMicOn(!isMicOn);
  };

  const handleToggleVideo = () => {
    toggleVideo();
    setIsVideoOn(!isVideoOn);
  };

  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(
      window.location.origin + `/room/${roomId}?isCreator=false`
    );
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleLeaveRoom = () => {
    navigate("/");
  };

  // Handle Enter key in chat input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-900">
      {/* Redesigned header with consistent alignment across all screens */}
      <header className="bg-gray-800 p-4 shadow-lg border-b border-gray-700">
        <div className="px-4 flex justify-between items-center">
          {/* Logo section - aligned left */}
          <div className="flex items-center">
            <div className="bg-blue-600 p-2 rounded-lg mr-2">
              <Video className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">WebRTC Conference</h1>
          </div>

          {/* Controls section - aligned right */}
          <div className="flex items-center space-x-2">
            {/* Participant counter */}
            <div className="flex items-center bg-gray-900 rounded-lg px-2 py-1.5 border border-gray-700">
              <Users className="h-4 w-4 text-blue-400 mr-1.5" />
              <span className="text-sm font-medium">
                {participants.length + 1}
              </span>
            </div>

            {/* Share button with dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowShareOptions(!showShareOptions)}
                className="flex items-center bg-blue-600 hover:bg-blue-700 rounded-lg px-2.5 py-1.5 transition-all duration-300"
              >
                <Share2 className="h-4 w-4 mr-1.5" />
                <span className="text-sm font-medium">Share</span>
              </button>

              {showShareOptions && (
                <div className="absolute top-full right-0 mt-1 bg-gray-800 rounded-lg shadow-xl border border-gray-700 p-2 z-10 w-64 animate-fadeIn">
                  <div className="p-2 border-b border-gray-700">
                    <h3 className="text-sm font-medium text-gray-300">
                      Share this room
                    </h3>
                  </div>

                  <div className="p-2 space-y-3">
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Room ID</div>
                      <div className="flex">
                        <input
                          type="text"
                          value={roomId}
                          readOnly
                          className="flex-1 bg-gray-700 text-white rounded-l-lg px-3 py-2 text-sm focus:outline-none"
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(roomId || "");
                            setIsCopied(true);
                            setTimeout(() => setIsCopied(false), 2000);
                          }}
                          className="bg-gray-600 hover:bg-gray-500 rounded-r-lg px-3 py-2"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-400 mb-1">
                        Invitation Link
                      </div>
                      <button
                        onClick={handleCopyRoomId}
                        className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-2 text-sm"
                      >
                        <Link className="h-4 w-4 mr-2" />
                        {isCopied ? "Copied!" : "Copy Invitation Link"}
                      </button>
                    </div>

                    <div>
                      <div className="text-xs text-gray-400 mb-1">
                        Quick Share
                      </div>
                      <div className="flex space-x-2">
                        <button className="flex-1 bg-gray-700 hover:bg-gray-600 rounded-lg p-2 text-sm">
                          Email
                        </button>
                        <button className="flex-1 bg-gray-700 hover:bg-gray-600 rounded-lg p-2 text-sm">
                          Message
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Chat toggle button - mobile only */}
            <button
              onClick={() => setIsChatOpen(!isChatOpen)}
              className={`p-1.5 rounded-lg ${
                isChatOpen ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"
              } sm:hidden`}
            >
              <MessageSquare className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main content with video grid and chat */}
      <main className="flex-1 p-4 sm:p-6 overflow-hidden bg-gray-900 flex">
        {/* Video grid - adjust width based on chat visibility */}
        <div
          className={`h-full transition-all duration-300 ${
            isChatOpen ? "w-full sm:w-3/4" : "w-full"
          }`}
        >
          <div className="h-full grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-fr">
            {/* If user is creator, show them first */}
            {isCreator && (
              <div className="relative bg-gray-800 rounded-lg overflow-hidden shadow-lg md:col-span-2 md:row-span-2 transition-all duration-300">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${
                    !isVideoOn ? "hidden" : ""
                  }`}
                />

                {!isVideoOn && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                    <div className="h-20 w-20 rounded-full bg-gray-700 flex items-center justify-center">
                      <Users className="h-10 w-10 text-gray-500" />
                    </div>
                  </div>
                )}

                <div className="absolute bottom-3 left-3 bg-gray-900 bg-opacity-70 rounded-md px-2 py-1">
                  <span className="text-sm font-medium">You (Host)</span>
                </div>

                {!isMicOn && (
                  <div className="absolute top-3 right-3 bg-red-500 rounded-full p-1">
                    <MicOff className="h-4 w-4" />
                  </div>
                )}
              </div>
            )}

            {/* If user is not creator, show creator first if available */}
            {!isCreator &&
              participants
                .filter((p) => p.isCreator)
                .map((participant) => (
                  <div
                    key={participant.id}
                    className="relative bg-gray-800 rounded-lg overflow-hidden shadow-lg md:col-span-2 md:row-span-2 animate-fadeIn transition-all duration-300"
                  >
                    <RemoteVideo participant={participant} />
                    <div className="absolute bottom-3 left-3 bg-gray-900 bg-opacity-70 rounded-md px-2 py-1">
                      <span className="text-sm font-medium">Host</span>
                    </div>
                  </div>
                ))}

            {/* If user is not creator, show them second */}
            {!isCreator && (
              <div className="relative bg-gray-800 rounded-lg overflow-hidden shadow-lg transition-all duration-300">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${
                    !isVideoOn ? "hidden" : ""
                  }`}
                />

                {!isVideoOn && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                    <div className="h-20 w-20 rounded-full bg-gray-700 flex items-center justify-center">
                      <Users className="h-10 w-10 text-gray-500" />
                    </div>
                  </div>
                )}

                <div className="absolute bottom-3 left-3 bg-gray-900 bg-opacity-70 rounded-md px-2 py-1">
                  <span className="text-sm font-medium">You</span>
                </div>

                {!isMicOn && (
                  <div className="absolute top-3 right-3 bg-red-500 rounded-full p-1">
                    <MicOff className="h-4 w-4" />
                  </div>
                )}
              </div>
            )}

            {/* Show all other participants */}
            {participants
              .filter((participant) => !participant.isCreator)
              .map((participant) => (
                <div
                  key={participant.id}
                  className="relative bg-gray-800 rounded-lg overflow-hidden shadow-lg animate-fadeIn transition-all duration-300"
                >
                  <RemoteVideo participant={participant} />
                  <div className="absolute bottom-3 left-3 bg-gray-900 bg-opacity-70 rounded-md px-2 py-1">
                    <span className="text-sm font-medium">Participant</span>
                  </div>
                </div>
              ))}

            {/* Empty placeholder for better grid layout when few participants */}
            {participants.length === 0 && !isCreator && (
              <div className="hidden md:block md:col-span-2 md:row-span-2"></div>
            )}
          </div>
        </div>

        {/* Chat panel with toggle functionality */}
        {isChatOpen && (
          <div className="w-full sm:w-1/4 bg-gray-800 rounded-lg ml-0 sm:ml-4 flex flex-col shadow-lg absolute sm:relative right-0 top-0 bottom-0 sm:top-auto sm:bottom-auto z-10 sm:z-0">
            <div className="p-3 border-b border-gray-700 font-medium flex justify-between items-center">
              <h3 className="flex items-center">
                <MessageSquare className="h-4 w-4 mr-2 text-blue-400" />
                Room Chat
              </h3>
              <button
                onClick={() => setIsChatOpen(false)}
                className="text-gray-400 hover:text-white sm:hidden"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Messages container */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {chatMessages.length === 0 ? (
                <p className="text-gray-500 text-center text-sm py-4">
                  No messages yet
                </p>
              ) : (
                chatMessages.map((msg, index) => (
                  <div
                    key={index}
                    className={`max-w-[85%] ${
                      msg.isFromMe ? "ml-auto bg-blue-600" : "bg-gray-700"
                    } rounded-lg p-2 break-words`}
                  >
                    <div className="text-xs text-gray-300 mb-1">
                      {msg.isFromMe ? "You" : msg.sender}
                    </div>
                    <div>{msg.text}</div>
                    <div className="text-xs text-gray-300 mt-1 text-right">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Message input */}
            <div className="p-3 border-t border-gray-700 flex">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="flex-1 bg-gray-700 text-white rounded-l-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={sendChatMessage}
                disabled={!message.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-r-lg px-3 py-2"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Controls with improved styling */}
      <footer className="bg-gray-800 p-4 shadow-lg border-t border-gray-700">
        <div className="max-w-7xl mx-auto flex justify-center items-center space-x-4">
          <button
            onClick={handleToggleMic}
            className={`p-3 rounded-full ${
              isMicOn
                ? "bg-gray-700 hover:bg-gray-600"
                : "bg-red-500 hover:bg-red-600"
            } transition-colors duration-300 shadow-lg`}
            aria-label={isMicOn ? "Mute microphone" : "Unmute microphone"}
          >
            {isMicOn ? (
              <Mic className="h-6 w-6" />
            ) : (
              <MicOff className="h-6 w-6" />
            )}
          </button>

          <button
            onClick={handleToggleVideo}
            className={`p-3 rounded-full ${
              isVideoOn
                ? "bg-gray-700 hover:bg-gray-600"
                : "bg-red-500 hover:bg-red-600"
            } transition-colors duration-300 shadow-lg`}
            aria-label={isVideoOn ? "Turn off camera" : "Turn on camera"}
          >
            {isVideoOn ? (
              <Video className="h-6 w-6" />
            ) : (
              <VideoOff className="h-6 w-6" />
            )}
          </button>

          <button
            onClick={handleLeaveRoom}
            className="p-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors duration-300 shadow-lg"
            aria-label="Leave call"
          >
            <Phone className="h-6 w-6 transform rotate-135" />
          </button>
        </div>
      </footer>
    </div>
  );
};

// Component for remote participant video
const RemoteVideo: React.FC<{ participant: Participant }> = ({
  participant,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className="w-full h-full object-cover"
    />
  );
};

export default Room;
