// recorder.js

let previewVideo, mirrorCanvas, flashOverlay, guideBorder, toast;
let startCameraBtn, modeButtonsContainer, modeBtns, startRecordBtn;

let mediaStream = null;
let canvasStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let drawFrameReq = null;

let currentMode = null;
const modeCounters = { video01: 0, video02: 0, flash01: 0 };

window.addEventListener("DOMContentLoaded", () => {
  // 1) Grab DOM references
  previewVideo         = document.getElementById("preview");
  mirrorCanvas         = document.getElementById("mirrorCanvas");
  flashOverlay         = document.getElementById("flashOverlay");
  guideBorder          = document.getElementById("guideBorder");
  toast                = document.getElementById("toast");

  startCameraBtn       = document.getElementById("startCameraBtn");
  modeButtonsContainer = document.getElementById("modeButtons");
  modeBtns             = Array.from(document.getElementsByClassName("modeBtn"));
  startRecordBtn       = document.getElementById("startRecordBtn");

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
    // Request a “taller” (portrait) camera stream if possible
    const constraints = {
      audio: true,
      video: {
        facingMode: "user",
        width: { ideal: 1080 },
        height: { ideal: 1920 },
        aspectRatio: 9/16
      }
    };
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

    // Feed the raw MediaStream into the hidden <video>
    previewVideo.srcObject = mediaStream;
    previewVideo.play();

    // Once video metadata is loaded, set up the canvas
    previewVideo.onloadedmetadata = () => {
      setupCanvas();
      startDrawingToCanvas();
    };

    // Hide the “Start Camera” button and reveal mode/select UI
    startCameraBtn.style.display       = "none";
    modeButtonsContainer.style.display = "block";
    startRecordBtn.style.display       = "inline-block";

    // Default guide border to large until user picks a mode
    guideBorder.classList.add("largeOval");
  } catch (err) {
    console.error("Unable to access camera:", err);
    toastOpen(`Error accessing camera:\n${err.message}`);
  }
}

// Prepare the <canvas> dimensions to be portrait, matching the video feed
function setupCanvas() {
  const vw = previewVideo.videoWidth;
  const vh = previewVideo.videoHeight;
  // We want portrait orientation (height > width). If the camera gave landscape, swap dims.
  if (vw > vh) {
    mirrorCanvas.width  = vh;
    mirrorCanvas.height = vw;
  } else {
    mirrorCanvas.width  = vw;
    mirrorCanvas.height = vh;
  }
}

// Continuously draw the mirrored + rotated video into the canvas
function startDrawingToCanvas() {
  const ctx = mirrorCanvas.getContext("2d");

  function drawFrame() {
    // Clear
    ctx.clearRect(0, 0, mirrorCanvas.width, mirrorCanvas.height);

    // Mirror + rotate so that “portrait” shows upright
    ctx.save();
    // Move origin to center of canvas
    ctx.translate(mirrorCanvas.width / 2, mirrorCanvas.height / 2);
    // Mirror horizontally
    ctx.scale(-1, 1);

    // If original is landscape, rotate 90° to become portrait
    if (previewVideo.videoWidth > previewVideo.videoHeight) {
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(
        previewVideo,
        -previewVideo.videoWidth / 2,
        -previewVideo.videoHeight / 2
      );
    } else {
      // Already portrait: just draw it mirrored
      ctx.drawImage(
        previewVideo,
        -mirrorCanvas.width / 2,
        -mirrorCanvas.height / 2,
        mirrorCanvas.width,
        mirrorCanvas.height
      );
    }
    ctx.restore();

    drawFrameReq = requestAnimationFrame(drawFrame);
  }

  drawFrame();
}

async function recordFiveSeconds() {
  if (!mediaStream) {
    toastOpen("No camera stream available.");
    startRecordBtn.disabled = false;
    return;
  }

  // 1) If “Flash” mode, request fullscreen
  if (currentMode === "flash01") {
    try {
      await document.documentElement.requestFullscreen();
    } catch (err) {
      console.warn("Fullscreen request failed:", err);
    }
  }

  // 2) Turn on flash (orange) overlay if needed
  flashOverlay.classList.remove("flashOn");
  if (currentMode === "flash01") {
    flashOverlay.classList.add("flashOn");
  }

  // 3) Show a 5-second countdown toast
  let countdown = 5;
  toastOpen(`Recording… ${countdown}s remaining`);
  const countdownInterval = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      toastOpen(`Recording… ${countdown}s remaining`);
    }
  }, 1000);

  // 4) Capture the canvas stream (portrait) instead of raw mediaStream
  if (canvasStream) {
    // Already capturing the canvas in startCamera()
  } else {
    // In case something went wrong, fallback to raw camera
    canvasStream = mirrorCanvas.captureStream(30);
    // If you want audio too, merge audio track
    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length) {
      audioTracks.forEach(track => canvasStream.addTrack(track));
    }
  }

  recordedChunks = [];
  let options = { mimeType: "video/mp4; codecs=avc1" };
  try {
    mediaRecorder = new MediaRecorder(canvasStream, options);
  } catch (e) {
    mediaRecorder = new MediaRecorder(canvasStream);
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = async () => {
    clearInterval(countdownInterval);
    toastClose();

    // 5) Hide flash overlay and exit fullscreen
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

    // 6) Download the recorded video blob
    const blob = new Blob(recordedChunks, { type: "video/mp4" });
    downloadBlob(blob);

    // 7) Re-enable “Start Recording”
    startRecordBtn.disabled = false;
  };

  mediaRecorder.start();

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
