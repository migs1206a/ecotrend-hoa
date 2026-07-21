import React, { useEffect, useState } from 'react';
import { apiUrl } from '../../utils/api';
import FileViewerModal from './FileViewerModal';

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
    <FileViewerModal
      title="Visitor Identification"
      subtitle={`${visitor?.name || 'Visitor'} - ${originalName}`}
      fileUrl={documentUrl}
      downloadUrl={documentUrl}
      downloadName={originalName}
      isPdf={isPDF}
      loading={loadingDocument}
      error={documentError}
      emptyMessage="No visitor identification is attached to this record."
      onClose={onClose}
    />
  );
};

export default VisitorIdentificationModal;
