import React from 'react';
import ReactDOM from 'react-dom/client';
import './Notifications.css';

// Global notification manager
let notificationRoot = null;
let notificationTimer = null;
let globalClickHandlers = {};

/**
 * Generic notification component
 */
function Notification({ type, data, onDismiss, onClick }) {
    React.useEffect(() => {
        // Auto-dismiss after 5 seconds
        const timer = setTimeout(() => {
            onDismiss();
        }, 5000);
        
        return () => clearTimeout(timer);
    }, [onDismiss]);
    
    // Render different content based on notification type
    const renderContent = () => {
        switch (type) {
            case 'Trophy':
                return (
                    <>
                        <div className="notification-icon-wrapper">
                            <div className="notification-icon">🏆</div>
                            {data.type === 'Progress' && data.progress && (
                                <div className="notification-milestone">{data.progress}</div>
                            )}
                            {data.type === 'Count' && data.qty && (
                                <div className="notification-milestone">{data.qty}x</div>
                            )}
                        </div>
                        <div className="notification-text">
                            <div className="notification-title">Trophy Earned!</div>
                            <div className="notification-name">{data.name}</div>
                        </div>
                    </>
                );
            
            case 'Phase Change':
                return (
                    <>
                        <div className="notification-icon-wrapper">
                            <div className="notification-icon">🌙</div>
                        </div>
                        <div className="notification-text">
                            <div className="notification-title">Phase Change</div>
                            <div className="notification-name">{data.message || 'Day has turned to night'}</div>
                        </div>
                    </>
                );
            
            case 'Message':
                return (
                    <>
                        <div className="notification-icon-wrapper">
                            <div className="notification-icon">📨</div>
                        </div>
                        <div className="notification-text">
                            <div className="notification-title">{data.title || 'New Message'}</div>
                            <div className="notification-name">{data.message}</div>
                        </div>
                    </>
                );
            
            default:
                return (
                    <>
                        <div className="notification-icon-wrapper">
                            <div className="notification-icon">ℹ️</div>
                        </div>
                        <div className="notification-text">
                            <div className="notification-title">Notification</div>
                            <div className="notification-name">{data.message || 'Something happened!'}</div>
                        </div>
                    </>
                );
        }
    };
    
    return (
        <div className="notification" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
            <button className="notification-dismiss" onClick={(e) => {
                e.stopPropagation();
                onDismiss();
            }}>×</button>
            <div className="notification-content">
                {renderContent()}
            </div>
        </div>
    );
}

/**
 * Shows a notification
 * @param {string} type - The type of notification ('Trophy', 'Phase Change', 'Message', etc.)
 * @param {Object} data - The data to display in the notification
 * @param {Function} onClick - Optional click handler for the notification
 */
/**
 * Register a global click handler for a notification type
 * @param {string} type - The notification type
 * @param {Function} handler - The click handler
 */
export function registerNotificationClickHandler(type, handler) {
    globalClickHandlers[type] = handler;
}

export function showNotification(type, data, onClick = null) {
    // Clear any existing notification
    if (notificationTimer) {
        clearTimeout(notificationTimer);
    }
    
    // Create or reuse the notification container
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        // Append to game container instead of body
        const gameContainer = document.querySelector('.game-container') || document.querySelector('.App') || document.body;
        gameContainer.appendChild(container);
    }
    
    if (!notificationRoot) {
        notificationRoot = ReactDOM.createRoot(container);
    }
    
    const handleDismiss = () => {
        if (notificationRoot) {
            notificationRoot.render(null);
        }
    };
    
    // Use passed onClick or fall back to global handler for this type
    const clickHandler = onClick || (globalClickHandlers[type] ? () => globalClickHandlers[type](data) : null);
    
    notificationRoot.render(
        <Notification 
            type={type}
            data={data}
            onDismiss={handleDismiss}
            onClick={clickHandler}
        />
    );
}