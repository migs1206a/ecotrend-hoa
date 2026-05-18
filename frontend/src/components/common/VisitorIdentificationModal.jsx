import React, { useEffect, useState } from 'react';
import { AlertCircle, Download, X } from 'lucide-react';
import { apiUrl } from '../../utils/api';
import './VisitorIdentificationModal.css';

const VisitorIdentificationModal = ({ visitor, token, onClose }) => {
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentError, setDocumentError] = useState('');
  const [loadingDocument, setLoadingDocument] = useState(true);

  const identificationDocument = visitor?.identificationDocument || {};
  const isPDF = identificationDocument.mimetype === 'application/pdf';
  const originalName = identificationDocument.originalName || 'visitor-identification';

  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;

    const loadDocument = async () => {
      setLoadingDocument(true);
      setDocumentError('');
      setDocumentUrl('');

      try {
        const response = await fetch(apiUrl(`/visitors/${visitor._id}/identification/file`), {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message || 'Failed to load visitor identification.');
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);

        if (!cancelled) {
          setDocumentUrl(objectUrl);
        }
      } catch (error) {
        if (!cancelled) {
          setDocumentError(error.message || 'Failed to load visitor identification.');
        }
      } finally {
        if (!cancelled) {
          setLoadingDocument(false);
        }
      }
    };

    if (visitor?._id && token) {
      loadDocument();
    }

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [token, visitor?._id]);

  return (
    <div className="visitor-id-viewer-overlay" onClick={onClose}>
      <div className="visitor-id-viewer-container" onClick={(event) => event.stopPropagation()}>
        <div className="visitor-id-viewer-header">
          <div>
            <h3>Visitor Identification</h3>
            <p>{visitor?.name || 'Visitor'} - {originalName}</p>
          </div>
          <div className="visitor-id-viewer-actions">
            <a
              href={documentUrl || '#'}
              download={originalName}
              className="visitor-id-viewer-download"
              onClick={(event) => {
                if (!documentUrl) {
                  event.preventDefault();
                }
              }}
            >
              <Download size={18} /> Download
            </a>
            <button type="button" onClick={onClose} className="visitor-id-viewer-close">
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="visitor-id-viewer-content">
          {loadingDocument ? (
            <div className="visitor-id-viewer-message">
              <div className="visitor-id-viewer-spinner" />
              <p>Loading document...</p>
            </div>
          ) : documentError ? (
            <div className="visitor-id-viewer-message visitor-id-viewer-message-error">
              <AlertCircle size={28} />
              <p>{documentError}</p>
            </div>
          ) : isPDF ? (
            <iframe src={documentUrl} title="Visitor Identification Document" className="visitor-id-viewer-frame" />
          ) : (
            <img src={documentUrl} alt="Visitor Identification Document" className="visitor-id-viewer-image" />
          )}
        </div>
      </div>
    </div>
  );
};

export default VisitorIdentificationModal;
