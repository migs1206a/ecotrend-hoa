import React from 'react';
import { AlertCircle, Download, X } from 'lucide-react';
import './FileViewerModal.css';

const FileViewerModal = ({
  title,
  subtitle = '',
  fileUrl = '',
  downloadUrl = '',
  downloadName = '',
  isPdf = false,
  loading = false,
  error = '',
  emptyMessage = 'No file available.',
  onClose
}) => {
  const resolvedDownloadUrl = downloadUrl || fileUrl || '';

  return (
    <div className="file-viewer-overlay" onClick={onClose}>
      <div className="file-viewer-container" onClick={(event) => event.stopPropagation()}>
        <div className="file-viewer-header">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <div className="file-viewer-actions">
            <a
              href={resolvedDownloadUrl || '#'}
              download={downloadName || undefined}
              className="file-viewer-download"
              onClick={(event) => {
                if (!resolvedDownloadUrl) {
                  event.preventDefault();
                }
              }}
            >
              <Download size={18} /> Download
            </a>
            <button type="button" onClick={onClose} className="file-viewer-close">
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="file-viewer-content">
          {loading ? (
            <div className="file-viewer-message">
              <div className="file-viewer-spinner" />
              <p>Loading document...</p>
            </div>
          ) : error ? (
            <div className="file-viewer-message file-viewer-message-error">
              <AlertCircle size={28} />
              <p>{error}</p>
            </div>
          ) : fileUrl ? (
            isPdf ? (
              <iframe src={fileUrl} title={title} className="file-viewer-frame" />
            ) : (
              <div className="file-viewer-image-scroll">
                <img src={fileUrl} alt={title} className="file-viewer-image" />
              </div>
            )
          ) : (
            <div className="file-viewer-message file-viewer-message-error">
              <AlertCircle size={28} />
              <p>{emptyMessage}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileViewerModal;
