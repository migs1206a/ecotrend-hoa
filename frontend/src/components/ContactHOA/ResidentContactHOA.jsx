import React, { useCallback, useEffect, useState } from 'react';
import { apiUrl, assetUrl } from '../../utils/api';
import { Image as ImageIcon, Loader, Phone } from 'lucide-react';
import './ResidentContactHOA.css';

const API = apiUrl('/contact-hoa');

const typeLabelMap = {
  mobile: 'Phone Number',
  landline: 'Landline',
  other: 'Other Contact'
};

const ResidentContactHOA = ({ token, showAlert }) => {
  const [settings, setSettings] = useState({ hierarchyImage: {}, contacts: [] });
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch(API, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to load Contact HOA details.');
      }

      setSettings({
        hierarchyImage: data?.hierarchyImage || {},
        contacts: Array.isArray(data?.contacts) ? data.contacts : []
      });
    } catch (error) {
      showAlert && showAlert(error.message || 'Failed to load Contact HOA details.', 'error');
      setSettings({ hierarchyImage: {}, contacts: [] });
    }
  }, [showAlert, token]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchSettings();
      setLoading(false);
    })();
  }, [fetchSettings]);

  return (
    <div className="contact-hoa-resident-root">
      <div className="page-header">
        <div className="page-title">
          <h2>Contact HOA</h2>
          
        </div>
      </div>

      {loading ? (
        <div className="contact-hoa-resident-loading">
          <Loader size={28} className="spin" />
          <p>Loading Contact HOA details...</p>
        </div>
      ) : (
        <>
          <div className="contact-hoa-resident-layout">
            <section className="contact-hoa-resident-card">
              <div className="contact-hoa-resident-card-head">
                <h3>Officers Hierarchy</h3>
                <p>This image is maintained by the HOA officers for resident reference.</p>
              </div>

              <div className="contact-hoa-resident-image-frame">
                {settings.hierarchyImage?.path ? (
                  <img src={assetUrl(settings.hierarchyImage.path)} alt="HOA officers hierarchy" />
                ) : (
                  <div className="contact-hoa-resident-empty">
                    <ImageIcon size={36} />
                    <p>No hierarchy image has been uploaded yet.</p>
                  </div>
                )}
              </div>
            </section>

            <section className="contact-hoa-resident-card">
              <div className="contact-hoa-resident-card-head">
                <h3>Contact Numbers</h3>
                <p>Use these numbers to reach the HOA office or assigned contacts.</p>
              </div>

              <div className="contact-hoa-resident-contact-list">
                {settings.contacts.length === 0 ? (
                  <div className="contact-hoa-resident-empty">
                    <Phone size={30} />
                    <p>No contact numbers are available yet.</p>
                  </div>
                ) : (
                  settings.contacts.map((contact) => (
                    <article key={contact._id || `${contact.label}-${contact.number}`} className="contact-hoa-resident-contact">
                      <div>
                        <span className="contact-hoa-resident-type">{typeLabelMap[contact.type] || 'Contact'}</span>
                        <h4>{contact.label}</h4>
                      </div>
                      <a href={`tel:${contact.number}`} className="contact-hoa-resident-link">
                        <Phone size={15} />
                        {contact.number}
                      </a>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
};

export default ResidentContactHOA;
