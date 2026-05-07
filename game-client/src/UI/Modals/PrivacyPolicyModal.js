import React from 'react';
import Modal from './Modal';
import './Modal.css';
import '../Buttons/SharedButtons.css';

export default function PrivacyPolicyModal({ onClose }) {
  return (
    <Modal isOpen={true} onClose={onClose} title="Privacy Policy" size="standard">
      <div className="privacy-policy-content" style={{ textAlign: 'left', maxHeight: '60vh', overflowY: 'auto', padding: '0 8px' }}>
        <p><em>Last updated: May 6, 2026</em></p>

        <p>
          We respect your privacy. This Privacy Policy explains what information we collect when you
          play our game, how we use it, and the choices you have. <strong>We do not sell or share your
          personal information with third parties for their own marketing or advertising purposes.</strong>
        </p>

        <h3>Information We Collect</h3>
        <p>
          To run your account and the game, we collect a limited amount of information you provide
          directly (such as your username, password, and language preference) along with information
          generated through normal gameplay (such as your in-game progress, inventory, settings, and
          activity timestamps). We may also collect basic device and browser diagnostics (such as
          browser type, operating system, screen size, and connection latency) to help us diagnose
          performance issues and improve the experience.
        </p>

        <h3>How We Use Your Information</h3>
        <p>
          We use the information we collect to operate the game, save your progress, authenticate
          your account, communicate important account or gameplay updates, and improve the game's
          performance and features. We do not use your information for advertising.
        </p>

        <h3>How We Share Your Information</h3>
        <p>
          We do not sell your personal information. We do not share your personal information with
          third parties for their own marketing purposes. We may share limited information only
          when necessary to operate the service (for example, with hosting and database providers
          that store the game's data on our behalf), or when required by law.
        </p>

        <h3>Data Retention</h3>
        <p>
          We keep your account and gameplay data for as long as your account is active. You can
          request deletion of your account at any time from the Settings panel by selecting "Delete
          Account." Deleting your account permanently removes your player data from our systems.
        </p>

        <h3>Security</h3>
        <p>
          We use reasonable technical and administrative safeguards to protect your information.
          No system is perfectly secure, but we work to keep your data safe and to limit access to
          it to those who need it to operate the service.
        </p>

        <h3>Children's Privacy</h3>
        <p>
          The game is not directed to children under the age of 13, and we do not knowingly collect
          personal information from children under 13. If you believe a child has provided us with
          personal information, please contact us so we can remove it.
        </p>

        <h3>Your Choices</h3>
        <p>
          You can review and update your account information at any time from the Settings panel.
          You can also delete your account from that same panel, which will permanently remove
          your data.
        </p>

        <h3>Changes to This Policy</h3>
        <p>
          We may update this Privacy Policy from time to time. When we do, we will update the date
          at the top of this page. Continued use of the game after a change indicates your
          acceptance of the updated policy.
        </p>

        <h3>Contact</h3>
        <p>
          If you have any questions about this Privacy Policy or how your information is handled,
          please contact us through the support channels listed in the game.
        </p>
      </div>

      <div className="modal-buttons shared-buttons">
        <button className="btn-basic btn-modal btn-success" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
