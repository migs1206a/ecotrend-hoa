import React from 'react';
import './PaginationControls.css';

const PaginationControls = ({ pagination, onPageChange }) => {
  if (!pagination || pagination.totalPages <= 1) {
    return null;
  }

  return (
    <div className="pagination-controls">
      <button
        type="button"
        className="pagination-btn"
        disabled={!pagination.hasPrevPage}
        onClick={() => onPageChange(pagination.page - 1)}
      >
        Previous
      </button>
      <span className="pagination-status">
        Page {pagination.page} of {pagination.totalPages}
      </span>
      <button
        type="button"
        className="pagination-btn"
        disabled={!pagination.hasNextPage}
        onClick={() => onPageChange(pagination.page + 1)}
      >
        Next
      </button>
    </div>
  );
};

export default PaginationControls;
