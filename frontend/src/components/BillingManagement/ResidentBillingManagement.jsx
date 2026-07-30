import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl, assetUrl } from '../../utils/api';
import {
  Receipt, AlertCircle, Clock, CheckCircle, Upload, QrCode,
  Eye, ChevronLeft, ChevronRight, XCircle
} from 'lucide-react';
import './ResidentBillingManagement.css';
import FileViewerModal from '../common/FileViewerModal';
import {
  DOCUMENT_UPLOAD_MAX_BYTES,
  formatFileSize,
  validatePdfOrImageFile
} from '../../utils/uploadValidation';

const MONTHS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];
const BASE_YEAR = 2023;
const DEFAULT_MONTHLY_DUE = 150;
const emptyMonths = () =>
  MONTHS.reduce((acc, month) => {
    acc[month] = {
      paid: false,
      orNumber: '',
      datePaid: '',
      remarks: '',
      paymentMethod: '',
      paymentStatus: 'none',
      receipt: {}
    };
    return acc;
  }, {});

const formatMonth = (month) => month.charAt(0) + month.slice(1).toLowerCase();

const ResidentBillingManagement = ({ token, userId, showAlert }) => {
  const [year, setYear] = useState(() => {
    const currentYear = new Date().getFullYear();
    return currentYear < BASE_YEAR ? BASE_YEAR : currentYear;
  });
  const [billing, setBilling] = useState({ monthlyDue: DEFAULT_MONTHLY_DUE, months: emptyMonths() });
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadingMonth, setUploadingMonth] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [receiptFiles, setReceiptFiles] = useState({});
  const [viewingReceipt, setViewingReceipt] = useState(null);
  const [viewingQr, setViewingQr] = useState(false);

  const fetchBilling = useCallback(async (targetYear) => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl(`/billing/my/${targetYear}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      const months = emptyMonths();
      if (data.months) {
        MONTHS.forEach((month) => {
          months[month] = { ...months[month], ...data.months[month] };
        });
      }
      setBilling({
        monthlyDue: data.monthlyDue || DEFAULT_MONTHLY_DUE,
        months
      });
    } catch (error) {
      setBilling({ monthlyDue: DEFAULT_MONTHLY_DUE, months: emptyMonths() });
    }
    setLoading(false);
  }, [token]);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/billing/settings'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setSettings(data);
    } catch (error) {
      setSettings(null);
    }
  }, [token]);

  useEffect(() => {
    fetchBilling(year);
    fetchSettings();
  }, [year, fetchBilling, fetchSettings]);

  const maxAvailableYear = Math.max(
    year,
    new Date().getFullYear() + 2,
    ...Object.keys(settings?.yearlyDues || {}).map((value) => Number(value)).filter(Number.isFinite),
    ...Object.keys(settings?.yearlyRenterDues || {}).map((value) => Number(value)).filter(Number.isFinite)
  );

  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonthIndex = currentDate.getMonth();

  const rows = useMemo(() => (
    MONTHS.map((month, index) => {
      const record = billing.months[month];
      const isPastDue = !record.paid && (year < currentYear || (year === currentYear && index < currentMonthIndex));
      const isCurrentDue = !record.paid && year === currentYear && index === currentMonthIndex;
      const statusLabel = record.paid
        ? 'Paid'
        : record.paymentStatus === 'pending'
        ? 'Pending Verification'
        : record.paymentStatus === 'rejected'
        ? 'Rejected'
        : isPastDue
        ? 'Past Due'
        : isCurrentDue
        ? 'Due'
        : 'Unpaid';

      return {
        month,
        label: formatMonth(month),
        record,
        statusLabel,
        statusClass: record.paid
          ? 'paid'
          : record.paymentStatus === 'pending'
          ? 'pending'
          : record.paymentStatus === 'rejected'
          ? 'rejected'
          : isPastDue
          ? 'past-due'
          : 'unpaid'
      };
    })
  ), [billing.months, year, currentYear, currentMonthIndex]);

  const paidCount = rows.filter((row) => row.record.paid).length;
  const pendingCount = rows.filter((row) => row.record.paymentStatus === 'pending').length;
  const unpaidCount = rows.length - paidCount;

  const handleReceiptUpload = async (month) => {
    const file = receiptFiles[month];
    if (!file) {
      showAlert?.('Please choose a receipt file first.', 'error');
      return;
    }

    setUploadingMonth(month);
    try {
      const formData = new FormData();
      formData.append('receipt', file);

      const response = await fetch(apiUrl(`/billing/${userId}/${year}/${month}/receipt`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      const data = await response.json();
      if (!response.ok) {
        showAlert?.(data.message || 'Failed to upload receipt', 'error');
        return;
      }

      showAlert?.('Receipt uploaded successfully. Waiting for admin verification.', 'success');
      setReceiptFiles((prev) => ({ ...prev, [month]: null }));
      setSelectedMonth('');
      fetchBilling(year);
    } catch (error) {
      showAlert?.('Failed to upload receipt', 'error');
    }
    setUploadingMonth('');
  };

  const handleReceiptFileChange = (month, event) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setReceiptFiles((prev) => ({
        ...prev,
        [month]: null
      }));
      return;
    }

    const validation = validatePdfOrImageFile(file, {
      label: 'Receipt file',
      maxBytes: DOCUMENT_UPLOAD_MAX_BYTES
    });

    if (!validation.valid) {
      showAlert?.(validation.message, 'error');
      event.target.value = '';
      return;
    }

    setReceiptFiles((prev) => ({
      ...prev,
      [month]: file
    }));
  };

  return (
    <div className="resident-billing-root">
      <div className="page-header">
        <div className="page-title">
          <h2>Billing &amp; Payments</h2>
          <p>Review dues, pay via GCash, and upload receipts for verification.</p>
        </div>
      </div>

      <div className="resident-billing-summary">
        <div className="resident-billing-card">
          <CheckCircle size={18} />
          <div><p>Paid Months</p><strong>{paidCount}</strong></div>
        </div>
        <div className="resident-billing-card">
          <Clock size={18} />
          <div><p>Pending Verification</p><strong>{pendingCount}</strong></div>
        </div>
        <div className="resident-billing-card">
          <AlertCircle size={18} />
          <div><p>Unpaid Months</p><strong>{unpaidCount}</strong></div>
        </div>
        <div className="resident-billing-card">
          <Receipt size={18} />
          <div><p>Monthly Due for {year}</p><strong>P{billing.monthlyDue}</strong></div>
        </div>
      </div>

      <div className="resident-billing-year-nav">
        <button onClick={() => setYear((value) => Math.max(BASE_YEAR, value - 1))} disabled={year <= BASE_YEAR}>
          <ChevronLeft size={16} /> Prev
        </button>
        <span>{year}</span>
        <button onClick={() => setYear((value) => Math.min(maxAvailableYear, value + 1))} disabled={year >= maxAvailableYear}>
          Next <ChevronRight size={16} />
        </button>
      </div>

      <div className="resident-billing-qr-card">
        <div className="resident-billing-qr-text">
          <h3><QrCode size={18} /> HOA GCash QR Code</h3>
          <p>Scan this QR code when paying, then upload your receipt under the corresponding month.</p>
        </div>
        {settings?.gcashQr?.path ? (
          <button
            type="button"
            className="resident-billing-qr-open-btn"
            onClick={() => {
              if (!settings?.gcashQr?.path) {
                showAlert?.('Admin has not uploaded the GCash QR code yet.', 'error');
                return;
              }
              setViewingQr(true);
            }}
          >
            <QrCode size={14} />
            View GCash QR
          </button>
        ) : (
          <div className="resident-billing-qr-empty">
            <AlertCircle size={16} />
            <span>Admin has not uploaded the GCash QR code yet.</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="spinner" />
          <p className="loading-text">Loading billing records...</p>
        </div>
      ) : (
        <div className="resident-billing-table-card">
          <table className="resident-billing-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Amount</th>
                <th>Status</th>
                <th>O.R. #</th>
                <th>Date Paid</th>
                <th>Receipt</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <React.Fragment key={row.month}>
                  <tr>
                    <td>{row.label}</td>
                    <td>P{billing.monthlyDue}.00</td>
                    <td>
                      <span className={`resident-billing-status ${row.statusClass}`}>
                        {row.statusLabel}
                      </span>
                    </td>
                    <td>{row.record.orNumber || '-'}</td>
                    <td>{row.record.datePaid || '-'}</td>
                    <td>
                      {row.record.receipt?.path ? (
                        <button className="resident-billing-view-btn" onClick={() => setViewingReceipt(row)}>
                          <Eye size={13} /> View
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      {!row.record.paid && (
                        <button
                          className="resident-billing-pay-btn"
                          onClick={() => setSelectedMonth((current) => current === row.month ? '' : row.month)}
                        >
                          {row.record.paymentStatus === 'pending' ? 'Update Receipt' : 'Pay with GCash'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {selectedMonth === row.month && (
                    <tr className="resident-billing-upload-row">
                      <td colSpan={7}>
                        <div className="resident-billing-upload-card">
                          <div className="resident-billing-upload-copy">
                            <h4>{row.label} Payment</h4>
                            <p>Scan the QR code above using GCash, complete the payment, and upload your receipt here for admin verification.</p>
                            {row.record.remarks && (
                              <p className="resident-billing-remarks-note">Admin note: {row.record.remarks}</p>
                            )}
                          </div>
                          <div className="resident-billing-upload-actions">
                            <label className="resident-billing-file-label">
                              <Upload size={14} />
                              {receiptFiles[row.month]?.name || `Choose Receipt (max ${formatFileSize(DOCUMENT_UPLOAD_MAX_BYTES)})`}
                              <input
                                type="file"
                                accept="image/*,.pdf"
                                onChange={(event) => handleReceiptFileChange(row.month, event)}
                              />
                            </label>
                            <button
                              className="resident-billing-submit-btn"
                              onClick={() => handleReceiptUpload(row.month)}
                              disabled={uploadingMonth === row.month}
                            >
                              {uploadingMonth === row.month ? 'Uploading...' : 'Upload Receipt'}
                            </button>
                            <button className="resident-billing-cancel-btn" onClick={() => setSelectedMonth('')}>
                              <XCircle size={14} /> Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewingReceipt && (
        <FileViewerModal
          title={`${viewingReceipt.label} Receipt`}
          subtitle={viewingReceipt.record.receipt.originalName || 'Resident receipt'}
          fileUrl={assetUrl(viewingReceipt.record.receipt.path)}
          downloadUrl={assetUrl(viewingReceipt.record.receipt.path)}
          downloadName={viewingReceipt.record.receipt.originalName || `${viewingReceipt.label}-receipt`}
          isPdf={viewingReceipt.record.receipt.mimetype === 'application/pdf'}
          onClose={() => setViewingReceipt(null)}
        />
      )}

      {viewingQr && settings?.gcashQr?.path && (
        <FileViewerModal
          title="HOA GCash QR Code"
          subtitle={settings.gcashQr.originalName || 'Payment QR code'}
          fileUrl={assetUrl(settings.gcashQr.path)}
          downloadUrl={assetUrl(settings.gcashQr.path)}
          downloadName={settings.gcashQr.originalName || 'hoa-gcash-qr'}
          onClose={() => setViewingQr(false)}
        />
      )}
    </div>
  );
};

export default ResidentBillingManagement;
