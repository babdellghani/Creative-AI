"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FaUpload } from "react-icons/fa";
import {
  generateSpeechToSpeech,
  generateUploadUrl,
  generationStatus,
} from "~/actions/generate-speech";
import { GenerateButton } from "~/components/client/generate-button";
import { useAudioStore } from "~/stores/audio-store";
import { useVoiceStore } from "~/stores/voice-store";
import { ServiceType } from "~/types/services";

const ALLOWED_AUDIO_TYPES = ["audio/mp3", "audio/wav"];

export function VoiceChanger({
  credits,
  service,
}: {
  credits: number;
  service: ServiceType;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentAudioId, setCurrentAudioId] = useState<string | null>(null);

  const { playAudio } = useAudioStore();
  const getSelectedVoice = useVoiceStore((state) => state.getSelectedVoice);

  const handleFileSelect = (selectedFile: File) => {
    const isAllowedAudio = ALLOWED_AUDIO_TYPES.includes(selectedFile.type);
    const isUnder50MB = selectedFile.size <= 50 * 1024 * 1024;

    if (isAllowedAudio && isUnder50MB) {
      setFile(selectedFile);
    } else {
      alert(
        isAllowedAudio
          ? "File is too large. Max size is 50MB"
          : "Please select an MP3 or WAV file only",
      );
    }
  };

  const handleGenerateSpeech = async () => {
    const selectedVoice = getSelectedVoice("seedvc");

    if (!file || !selectedVoice) return;

    // Check if user has enough credits before proceeding
    if (credits < 15) {
      toast.error(
        "Not enough credits! You need at least 15 credits to convert voice.",
      );
      return;
    }

    try {
      setIsLoading(true);

      const { uploadUrl, s3Key } = await generateUploadUrl(file.type);

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed ot upload file to storage");
      }

      const { audioId, shouldShowThrottleAlert } = await generateSpeechToSpeech(
        s3Key,
        selectedVoice.id,
      );

      if (shouldShowThrottleAlert) {
        toast("Exceeding 3 requests per minute will queue your requests.", {
          icon: "⏳",
        });
      }
      setCurrentAudioId(audioId);
    } catch (error) {
      console.error("Error generating speech: ", error);

      // Check if the error is about insufficient credits
      if (
        error instanceof Error &&
        error.message.includes("Not enough credits")
      ) {
        toast.error(
          "Not enough credits! You need at least 15 credits to convert voice.",
        );
      } else {
        toast.error("Failed to convert voice. Please try again.");
      }

      setIsLoading(false);
    }
  };

  // Add voice loading initialization
  const { loadVoices } = useVoiceStore();

  // Initialize voices when component mounts
  useEffect(() => {
    void loadVoices().catch((error) => {
      console.error("Failed to load voices:", error);
    });
  }, [loadVoices]);

  useEffect(() => {
    if (!currentAudioId || !isLoading) return;

    const pollInterval = setInterval(async () => {
      try {
        const status = await generationStatus(currentAudioId);

        const selectedVoice = getSelectedVoice("seedvc");

        if (status.success && status.audioUrl && selectedVoice) {
          clearInterval(pollInterval);
          setIsLoading(false);

          const newAudio = {
            id: currentAudioId,
            title: file?.name || "Voice changed audio",
            audioUrl: status.audioUrl,
            voice: selectedVoice.id,
            duration: "0:30",
            progress: 0,
            service: service,
            createdAt: new Date().toLocaleDateString(),
          };

          playAudio(newAudio);
          setCurrentAudioId(null);
          setFile(null);
        } else if (!status.success) {
          clearInterval(pollInterval);
          setIsLoading(false);
          setCurrentAudioId(null);
          console.error("Voice changing failed");
        }
      } catch (error) {
        console.error("Error polling for audio status: " + error);
        clearInterval(pollInterval);
        setIsLoading(false);
        setCurrentAudioId(null);
      }
    }, 500);

    return () => {
      clearInterval(pollInterval);
    };
  }, [currentAudioId, isLoading, getSelectedVoice, playAudio, file]);

  return (
    <>
      <div className="flex flex-1 flex-col justify-between px-4">
        <div className="flex flex-1 items-center justify-center py-8">
          <div
            className={`w-full max-w-xl rounded-2xl border-2 border-dotted p-8 transition-all duration-200 ${
              isDragging
                ? "border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/30"
                : "border-gray-300 dark:border-gray-600"
            } ${
              file
                ? "bg-background dark:bg-background"
                : "bg-gray-50 dark:bg-gray-900/50"
            }`}
            onDragOver={() => setIsDragging(true)}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              setIsDragging(false);

              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                if (file) {
                  handleFileSelect(file);
                }
              }
            }}
            onClick={() => {
              if (isLoading) return;

              const input = document.createElement("input");
              input.type = "file";
              input.accept = "audio/mp3,audio/wav";
              input.onchange = (e) => {
                const target = e.target as HTMLInputElement;
                if (target.files && target.files.length > 0) {
                  const file = target.files[0];
                  if (file) {
                    handleFileSelect(file);
                  }
                }
              };
              input.click();
            }}
          >
            {file ? (
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 rounded-lg border border-border bg-background p-3 dark:bg-card">
                  <FaUpload className="h-4 w-4 text-blue-400 dark:text-blue-500" />
                </div>
                <p className="mb-1 text-sm font-medium text-foreground">
                  {file.name}
                </p>
                <p className="mb-1 text-sm font-medium text-foreground">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isLoading) {
                      setFile(null);
                    }
                  }}
                  disabled={isLoading}
                  className={`mt-2 text-sm ${
                    isLoading
                      ? "cursor-not-allowed text-muted-foreground"
                      : "text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  }`}
                >
                  Choose a different file
                </button>
              </div>
            ) : (
              <div className="flex cursor-pointer flex-col items-center py-8 text-center">
                <div className="mb-4 rounded-lg border border-border bg-background p-3 dark:bg-card">
                  <FaUpload className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mb-1 text-sm font-medium text-foreground">
                  Click to upload, or drag and drop
                </p>
                <p className="text-xs text-muted-foreground">
                  MP3 or WAV files only, up to 50MB
                </p>
              </div>
            )}
          </div>
        </div>

        <GenerateButton
          onGenerate={handleGenerateSpeech}
          isDisabled={!file || isLoading}
          isLoading={isLoading}
          showCredits={true}
          creditsRemaining={credits}
          buttonText="Convert Voice"
        />
      </div>
    </>
  );
}
