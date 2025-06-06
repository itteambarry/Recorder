// recorder.js

let previewVideo, flashOverlay, guideBorder, toast;
let startCameraBtn, modeButtonsContainer, modeBtns, startRecordBtn;

let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];

let currentMode = null;
const modeCounters = { video01: 0, video02: 0, flash01: 0 };

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
        width: { ideal: 960 },
        height: { ideal: 1280 }
      }
    };
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    previewVideo.srcObject = mediaStream;
    previewVideo.style.transform = "scaleX(-1)";

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

  // 4) Set up MediaRecorder
  recordedChunks = [];
  let options = { mimeType: "video/mp4; codecs=avc1" };
  try {
    mediaRecorder = new MediaRecorder(mediaStream, options);
  } catch (e) {
    mediaRecorder = new MediaRecorder(mediaStream);
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = async () => {
    clearInterval(countdownInterval);
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
