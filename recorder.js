// recorder.js

let previewVideo, flashOverlay, guideBorder, toast;
let startCameraBtn, modeButtonsContainer, modeBtns, startRecordBtn;

let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];

let currentMode = null;
const modeCounters = { video01: 0, video02: 0, flash01: 0 };

let captureCanvas = null;
let captureCtx = null;

window.addEventListener("DOMContentLoaded", () => {
  // 1) Grab DOM references
  previewVideo          = document.getElementById("preview");
  flashOverlay          = document.getElementById("flashOverlay");
  guideBorder           = document.getElementById("guideBorder");
  toast                 = document.getElementById("toast");

  startCameraBtn        = document.getElementById("startCameraBtn");
  modeButtonsContainer  = document.getElementById("modeButtons");
  modeBtns              = Array.from(document.getElementsByClassName("modeBtn"));
  startRecordBtn        = document.getElementById("startRecordBtn");

  captureCanvas = document.getElementById("captureCanvas");
  captureCtx = captureCanvas.getContext("2d");

  // 2) Start Camera button
  startCameraBtn.addEventListener("click", startCamera);

  // 3) Mode buttons
  modeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      modeBtns.forEach(b => b.classList.remove("selectedMode"));
      btn.classList.add("selectedMode");

      currentMode = btn.dataset.mode;

      guideBorder.classList.remove("smallOval", "largeOval");
      if (currentMode === "video01") {
        guideBorder.classList.add("smallOval");
      } else {
        guideBorder.classList.add("largeOval");
      }

      startRecordBtn.disabled = false;
    });
  });

  // 4) Start Recording button
  startRecordBtn.addEventListener("click", () => {
    if (!currentMode) {
      alert("Please select a mode (Video 01, Video 02, or Flash) first.");
      return;
    }
    startRecordBtn.disabled = true;
    recordFiveSeconds();
  });
});

async function startCamera() {
  try {
    const constraints = {
      audio: true,
      video: { 
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 960 }
      }
    };
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    previewVideo.srcObject = mediaStream;
    previewVideo.style.transform = "scaleX(-1)";

    // Log the actual video dimensions
    const track = mediaStream.getVideoTracks()[0];
    const settings = track.getSettings();
    console.log('Actual video dimensions:', settings.width, 'x', settings.height);

    startCameraBtn.style.display       = "none";
    modeButtonsContainer.style.display = "block";
    startRecordBtn.style.display       = "inline-block";

    guideBorder.classList.add("largeOval");
  } catch (err) {
    console.error("Unable to access camera:", err);
    toastOpen(`Error accessing camera:\n${err.message}`);
  }
}

async function recordFiveSeconds() {
  if (!mediaStream) {
    toastOpen("No camera stream available.");
    startRecordBtn.disabled = false;
    return;
  }

  // 1) If "Flash" mode, request Fullscreen first
  if (currentMode === "flash01") {
    try {
      await document.documentElement.requestFullscreen();
    } catch (err) {
      console.warn("Fullscreen request failed:", err);
    }
  }

  // 2) Apply the white-outside-oval overlay
  flashOverlay.classList.remove("flashOn");
  if (currentMode === "flash01") {
    flashOverlay.classList.add("flashOn");
  }

  // 3) Show a 5 s countdown
  let countdown = 5;
  toastOpen(`Recording… ${countdown}s remaining`);
  const countdownInterval = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      toastOpen(`Recording… ${countdown}s remaining`);
    }
  }, 1000);

  // 4) Set up MediaRecorder using canvas stream
  recordedChunks = [];
  
  // Draw video to canvas at 3:4 aspect ratio
  let drawInterval;
  function drawToCanvas() {
    const video = previewVideo;
    const canvas = captureCanvas;
    const ctx = captureCtx;

    // Set canvas dimensions to match video dimensions for better quality
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate the scaling to maintain 3:4 aspect ratio
    const videoAspect = video.videoWidth / video.videoHeight;
    const targetAspect = 960 / 1280; // 3:4

    let drawWidth, drawHeight, offsetX = 0, offsetY = 0;

    if (videoAspect > targetAspect) {
      // Video is wider than target - fit to height
      drawHeight = canvas.height;
      drawWidth = drawHeight * videoAspect;
      offsetX = (canvas.width - drawWidth) / 2;
    } else {
      // Video is taller than target - fit to width
      drawWidth = canvas.width;
      drawHeight = drawWidth / videoAspect;
      offsetY = (canvas.height - drawHeight) / 2;
    }

    // Enable image smoothing for better quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Draw the video centered on the canvas
    ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
  }

  // Increase frame rate to 60 FPS for smoother video
  drawInterval = setInterval(drawToCanvas, 1000 / 60);

  const canvasStream = captureCanvas.captureStream(60);
  let options = { 
    mimeType: "video/mp4; codecs=avc1",
    videoBitsPerSecond: 8000000 // 8 Mbps for better quality
  };
  try {
    mediaRecorder = new MediaRecorder(canvasStream, options);
  } catch (e) {
    console.warn("MP4 codec not supported, falling back to default:", e);
    mediaRecorder = new MediaRecorder(canvasStream);
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = async () => {
    clearInterval(countdownInterval);
    clearInterval(drawInterval);
    toastClose();

    // 5) Hide the white overlay and exit Fullscreen
    if (currentMode === "flash01") {
      flashOverlay.classList.remove("flashOn");
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch (err) {
          console.warn("Failed to exit fullscreen:", err);
        }
      }
    }

    // 6) Download the recorded video
    const blob = new Blob(recordedChunks, { type: "video/mp4" });
    downloadBlob(blob);

    // 7) Re-enable "Start Recording"
    startRecordBtn.disabled = false;
  };

  // Request data every second to ensure we get the full recording
  mediaRecorder.start(1000);

  // 8) Automatically stop after 5 seconds
  setTimeout(() => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }, 5000);
}

function toastOpen(message) {
  toast.textContent = message;
  toast.style.display = "block";
}
function toastClose() {
  toast.style.display = "none";
}

function downloadBlob(blob) {
  modeCounters[currentMode]++;
  const filename = `VIB_${currentMode}_${modeCounters[currentMode]}.mp4`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
