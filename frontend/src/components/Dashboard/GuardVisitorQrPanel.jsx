import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle, QrCode, ScanLine } from 'lucide-react';
import { apiUrl } from '../../utils/api';
import useHtml5QrScanner from '../../hooks/useHtml5QrScanner';
import { extractVisitorQrCredential } from '../../utils/visitorQr';

const QR_CHECKPOINT_OPTIONS = [
  { value: 'gate_entry', label: 'Gate Entrance' },
  { value: 'gate_exit', label: 'Gate Exit' }
];

const GuardVisitorQrPanel = ({ token, codeRequest, onRecorded, showAlert }) => {
  const [qrCheckpoint, setQrCheckpoint] = useState('gate_entry');
  const [qrTokenInput, setQrTokenInput] = useState('');
  const notify = useCallback((message, type = 'info') => {
    if (typeof showAlert === 'function') {
      showAlert(message, type);
      return;
    }

    console.warn(message);
  }, [showAlert]);

  useEffect(() => {
    if (!codeRequest?.code) {
      return;
    }

    setQrTokenInput(codeRequest.code);
  }, [codeRequest]);

  const submitQrScan = useCallback(async (rawValue) => {
    const qrToken = extractVisitorQrCredential(rawValue);

    if (!qrToken) {
      notify('Please scan a valid QR pass or enter the short visitor code.', 'error');
      return false;
    }

    try {
      const response = await fetch(apiUrl('/visitors/qr/scan'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ qrToken, checkpoint: qrCheckpoint })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        notify(data.message || 'Failed to record QR checkpoint.', 'error');
        return false;
      }

      notify(data.message || 'QR checkpoint recorded.', 'success');
      setQrTokenInput('');
      onRecorded?.();
      return true;
    } catch (error) {
      notify('Failed to record QR checkpoint.', 'error');
      return false;
    }
  }, [notify, onRecorded, qrCheckpoint, token]);

  const {
    scannerActive,
    scannerStarting,
    startScanner,
    stopScanner
  } = useHtml5QrScanner({
    containerId: 'guard-visitor-qr-scanner',
    onScanSuccess: submitQrScan,
    onStartError: (message) => {
      notify(message || 'Unable to open camera for QR scanning.', 'error');
    }
  });

  return (
    <div className="guard-qr-panel">
      <div className="guard-qr-panel-head">
        <div>
          <h3><QrCode size={18} /> QR Checkpoint Scanner</h3>
          <p>Select a gate checkpoint, then scan the QR or enter the short visitor code manually when camera access is unavailable.</p>
        </div>
        <select value={qrCheckpoint} onChange={(event) => setQrCheckpoint(event.target.value)} className="form-input">
          {QR_CHECKPOINT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      <div className="guard-qr-controls">
        <button
          type="button"
          className="btn-approve"
          onClick={scannerActive ? stopScanner : startScanner}
          disabled={scannerStarting}
        >
          <ScanLine size={16} />{scannerStarting ? 'Starting...' : (scannerActive ? 'Stop Scanner' : 'Scan QR')}
        </button>
        <input
          type="text"
          value={qrTokenInput}
          onChange={(event) => setQrTokenInput(event.target.value)}
          placeholder="Short visitor code or QR token"
          className="form-input"
        />
        <button
          type="button"
          className="btn-approve"
          onClick={async () => {
            const recorded = await submitQrScan(qrTokenInput);
            if (recorded) {
              stopScanner();
            }
          }}
        >
          <CheckCircle size={16} />Record
        </button>
      </div>
      <div
        id="guard-visitor-qr-scanner"
        className={`guard-qr-video guard-qr-reader${scannerActive ? ' active' : ''}`}
        aria-hidden={!scannerActive}
      />
    </div>
  );
};

export default GuardVisitorQrPanel;
