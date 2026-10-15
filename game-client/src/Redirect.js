/**
 * Temporary redirect component to migrate users from old domain to new domain.
 * Delete this file once migration is complete.
 */

const NEW_DOMAIN = 'https://www.SECRETSofELSINORE.com';

function Redirect() {
  const handleGo = () => {
    window.location.href = NEW_DOMAIN;
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999999
    }}>
      <div style={{
        backgroundColor: 'var(--color-bg-modal)',
        padding: '40px',
        borderRadius: 'var(--radius-lg)',
        textAlign: 'center',
        maxWidth: '400px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
      }}>
        <h2 style={{ marginTop: 0, color: 'var(--color-text-primary)' }}>
          This game has moved!
        </h2>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-lg)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          Please visit the new site and log in there with your username and password:
        </p>
        <p style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'var(--text-xl)',
          fontWeight: 'bold',
          color: 'var(--color-text-link)',
          margin: '20px 0'
        }}>
          {NEW_DOMAIN.replace('https://', '')}
        </p>
        <button
          onClick={handleGo}
          style={{
            backgroundColor: 'var(--color-success)',
            color: 'var(--color-text-white)',
            border: 'none',
            padding: '12px 40px',
            fontFamily: 'var(--btn-font-family)',
            fontSize: 'var(--text-xl)',
            fontWeight: 'var(--btn-font-weight)',
            borderRadius: 'var(--btn-radius)',
            boxShadow: 'var(--btn-shadow)',
            cursor: 'pointer',
            marginTop: '10px'
          }}
        >
          Go
        </button>
      </div>
    </div>
  );
}

// Check if we should show the redirect (user is on old domain)
export function shouldRedirect() {
  const hostname = window.location.hostname;
  return hostname.includes('valleyviewgame.com');
}

export default Redirect;
