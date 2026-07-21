import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const SCANNER_CONFIG = {
  formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
  useBarCodeDetectorIfSupported: false,
  verbose: false
};

const normalizeCameraError = (error) => {
  const name = String(error?.name || '').trim();
  const message = String(error?.message || '').trim();

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera permission was denied. Allow camera access in the browser, then try again.';
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera device was found for this browser session.';
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The camera is already in use by another app or browser tab.';
  }

  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'The requested camera mode is not available on this device.';
  }

  if (name === 'AbortError') {
    return 'The browser interrupted camera startup. Try again.';
  }

  if (message) {
    return `Unable to open the camera scanner. ${message}`;
  }

  return 'Unable to open the camera scanner.';
};

const stopMediaStream = (stream) => {
  if (!stream) {
    return;
  }

  stream.getTracks().forEach((track) => track.stop());
};

export default function useHtml5QrScanner({
  containerId,
  onScanSuccess,
  onStartError
}) {
  const scannerRef = useRef(null);
  const scanLockRef = useRef(false);
  const lastScanRef = useRef({ value: '', at: 0 });
  const stopInFlightRef = useRef(null);
  const startInFlightRef = useRef(null);
  const stopRequestedRef = useRef(false);
  const preferredDeviceIdRef = useRef('');
  const onScanSuccessRef = useRef(onScanSuccess);
  const onStartErrorRef = useRef(onStartError);
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerStarting, setScannerStarting] = useState(false);

  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  useEffect(() => {
    onStartErrorRef.current = onStartError;
  }, [onStartError]);

  const clearContainer = useCallback(() => {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = '';
    }
  }, [containerId]);

  const scanConfig = useMemo(() => ({
    fps: 10,
    qrbox: (viewfinderWidth, viewfinderHeight) => {
      const shortestSide = Math.max(50, Math.min(viewfinderWidth, viewfinderHeight));
      const boxSize = Math.max(160, Math.min(280, Math.floor(shortestSide * 0.58)));
      return { width: boxSize, height: boxSize };
    },
    aspectRatio: 4 / 3,
    disableFlip: false
  }), []);

  const stopScanner = useCallback(async () => {
    if (stopInFlightRef.current) {
      return stopInFlightRef.current;
    }

    stopRequestedRef.current = true;

    if (startInFlightRef.current) {
      try {
        await startInFlightRef.current;
      } catch (error) {
        // Ignore startup failures here; cleanup continues below.
      }
    }

    const activeScanner = scannerRef.current;
    scannerRef.current = null;
    scanLockRef.current = false;
    lastScanRef.current = { value: '', at: 0 };
    setScannerActive(false);
    setScannerStarting(false);

    if (!activeScanner) {
      clearContainer();
      return Promise.resolve();
    }

    stopInFlightRef.current = (async () => {
      try {
        await activeScanner.stop();
      } catch (error) {
        // The scanner may already be stopped if the browser rejected the stream mid-session.
      }

      try {
        activeScanner.clear();
      } catch (error) {
        // No-op. The scanner container might already be removed.
      }

      clearContainer();
    })();

    try {
      await stopInFlightRef.current;
    } finally {
      stopInFlightRef.current = null;
      stopRequestedRef.current = false;
    }
  }, [clearContainer]);

  useEffect(() => () => {
    stopScanner();
  }, [stopScanner]);

  const startScanner = useCallback(async () => {
    if (startInFlightRef.current) {
      return startInFlightRef.current;
    }

    startInFlightRef.current = (async () => {
      stopRequestedRef.current = false;

      if (stopInFlightRef.current) {
        await stopInFlightRef.current;
      }

      if (scannerRef.current) {
        return;
      }

      if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        onStartErrorRef.current?.('Camera access requires HTTPS or localhost. Open this page on a secure origin or use the manual QR field instead.');
        return;
      }

      if (!navigator?.mediaDevices?.getUserMedia) {
        onStartErrorRef.current?.('Camera access is not available in this browser. Use the manual QR field instead.');
        return;
      }

      const container = document.getElementById(containerId);
      if (!container) {
        onStartErrorRef.current?.('The QR scanner surface is not available on this screen yet.');
        return;
      }

      container.style.width = '100%';
      container.style.maxWidth = '560px';
      container.style.minHeight = '420px';
      container.style.position = 'relative';

      let preferredDeviceId = preferredDeviceIdRef.current;
      let permissionStream = null;

      if (!preferredDeviceId) {
        try {
          permissionStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false
          });
        } catch (primaryPermissionError) {
          try {
            permissionStream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false
            });
          } catch (fallbackPermissionError) {
            onStartErrorRef.current?.(normalizeCameraError(fallbackPermissionError || primaryPermissionError));
            return;
          }
        }

        try {
          preferredDeviceId = String(permissionStream?.getVideoTracks?.()[0]?.getSettings?.().deviceId || '').trim();
          preferredDeviceIdRef.current = preferredDeviceId;
        } finally {
          stopMediaStream(permissionStream);
        }
      }

      setScannerStarting(true);
      setScannerActive(true);
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      clearContainer();

      const scanner = new Html5Qrcode(containerId, SCANNER_CONFIG);
      scannerRef.current = scanner;

      const handleScanSuccess = async (decodedText) => {
        if (scanLockRef.current) {
          return;
        }

        const normalizedDecodedText = String(decodedText || '').trim();
        const now = Date.now();
        if (
          normalizedDecodedText &&
          lastScanRef.current.value === normalizedDecodedText &&
          now - lastScanRef.current.at < 4000
        ) {
          return;
        }

        scanLockRef.current = true;

        try {
          const recorded = await onScanSuccessRef.current?.(decodedText);
          if (recorded !== false && normalizedDecodedText) {
            lastScanRef.current = {
              value: normalizedDecodedText,
              at: now
            };
          }
        } finally {
          window.setTimeout(() => {
            if (scannerRef.current) {
              scanLockRef.current = false;
            }
          }, 2500);
        }
      };

      try {
        await scanner.start(
          preferredDeviceId || { facingMode: { ideal: 'environment' } },
          scanConfig,
          handleScanSuccess
        );
        if (stopRequestedRef.current) {
          try {
            await scanner.stop();
          } catch (error) {
            // Ignore interrupted startup cleanup.
          }
          try {
            scanner.clear();
          } catch (error) {
            // Ignore container cleanup errors while honoring the pending stop.
          }
          scannerRef.current = null;
          scanLockRef.current = false;
          setScannerActive(false);
          setScannerStarting(false);
          clearContainer();
          return;
        }
        setScannerStarting(false);
        return;
      } catch (primaryError) {
        if (stopRequestedRef.current) {
          scannerRef.current = null;
          setScannerActive(false);
          setScannerStarting(false);
          clearContainer();
          return;
        }

        try {
          preferredDeviceIdRef.current = '';
          const cameras = await Html5Qrcode.getCameras();
          const fallbackCamera = cameras.find((camera) => /back|rear|environment/i.test(String(camera?.label || ''))) || cameras?.[0];

          if (!fallbackCamera?.id) {
            throw primaryError;
          }

          preferredDeviceIdRef.current = fallbackCamera.id;
          await scanner.start(
            fallbackCamera.id,
            scanConfig,
            handleScanSuccess
          );
          if (stopRequestedRef.current) {
            try {
              await scanner.stop();
            } catch (error) {
              // Ignore interrupted startup cleanup.
            }
            try {
              scanner.clear();
            } catch (error) {
              // Ignore container cleanup errors while honoring the pending stop.
            }
            scannerRef.current = null;
            scanLockRef.current = false;
            setScannerActive(false);
            setScannerStarting(false);
            clearContainer();
            return;
          }
          setScannerStarting(false);
          return;
        } catch (fallbackError) {
          if (stopRequestedRef.current) {
            scannerRef.current = null;
            setScannerActive(false);
            setScannerStarting(false);
            clearContainer();
            return;
          }

          scannerRef.current = null;
          scanLockRef.current = false;
          setScannerActive(false);
          setScannerStarting(false);

          try {
            scanner.clear();
          } catch (error) {
            // Ignore cleanup errors while surfacing the actual start failure.
          }

          clearContainer();

          onStartErrorRef.current?.(normalizeCameraError(fallbackError || primaryError));
        }
      }
    })();

    try {
      await startInFlightRef.current;
    } finally {
      startInFlightRef.current = null;
    }
  }, [clearContainer, containerId, scanConfig]);

  return {
    scannerActive,
    scannerStarting,
    startScanner,
    stopScanner
  };
}
