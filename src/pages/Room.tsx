import React, { useEffect, useRef, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { Video, Mic, MicOff, VideoOff, Phone, Copy, Users } from "lucide-react";
import { useWebRTC } from "../hooks/useWebRTC";

interface Participant {
  id: string;
  stream: MediaStream;
  isCreator: boolean;
}

const Room: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const isCreator =
    new URLSearchParams(location.search).get("isCreator") === "true";

  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isCopied, setIsCopied] = useState(false);

  const { localStream, participants, toggleAudio, toggleVideo, error } =
    useWebRTC({ roomId: roomId || "", isCreator });

  const localVideoRef = useRef<HTMLVideoElement>(null);

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

  return (
    <div className="min-h-screen flex flex-col">
      {/* Room header */}
      <header className="bg-gray-800 p-4 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center">
          <div className="flex items-center mb-3 sm:mb-0">
            <Video className="h-6 w-6 text-blue-500 mr-2" />
            <h1 className="text-xl font-bold">WebRTC Room</h1>
          </div>

          <div className="flex items-center space-x-2">
            <div className="flex items-center bg-gray-700 rounded-lg px-3 py-2">
              <Users className="h-4 w-4 text-blue-400 mr-2" />
              <span className="text-sm">
                {participants.length + 1} participants
              </span>
            </div>

            <div className="relative flex items-center bg-gray-700 rounded-lg px-3 py-2">
              <span className="text-sm mr-2 truncate max-w-[180px]">
                Room: {roomId}
              </span>
              <button
                onClick={handleCopyRoomId}
                className="text-blue-400 hover:text-blue-300 focus:outline-none"
                aria-label="Copy room link"
              >
                <Copy className="h-4 w-4" />
              </button>
              {isCopied && (
                <div className="absolute top-full left-0 mt-2 px-2 py-1 bg-gray-900 text-xs rounded">
                  Copied!
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Video grid */}
      <main className="flex-1 p-4 sm:p-6 overflow-hidden bg-gray-900">
        <div className="h-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
          {/* Local video (always first) */}
          <div className="relative bg-gray-800 rounded-lg overflow-hidden shadow-lg">
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
              <span className="text-sm font-medium">
                You {isCreator ? "(Host)" : ""}
              </span>
            </div>

            {!isMicOn && (
              <div className="absolute top-3 right-3 bg-red-500 rounded-full p-1">
                <MicOff className="h-4 w-4" />
              </div>
            )}
          </div>

          {/* Remote participants */}
          {participants.map((participant) => (
            <div
              key={participant.id}
              className="relative bg-gray-800 rounded-lg overflow-hidden shadow-lg"
            >
              <RemoteVideo participant={participant} />
              <div className="absolute bottom-3 left-3 bg-gray-900 bg-opacity-70 rounded-md px-2 py-1">
                <span className="text-sm font-medium">
                  {participant.isCreator ? "Host" : "Participant"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Controls */}
      <footer className="bg-gray-800 p-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-center items-center space-x-4">
          <button
            onClick={handleToggleMic}
            className={`p-3 rounded-full ${
              isMicOn
                ? "bg-gray-700 hover:bg-gray-600"
                : "bg-red-500 hover:bg-red-600"
            } transition-colors duration-300`}
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
            } transition-colors duration-300`}
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
            className="p-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors duration-300"
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
