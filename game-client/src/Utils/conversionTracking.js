/**
 * Conversion Tracking Utility
 * Handles conversion events for various advertising platforms
 */

// Google Analytics 4 Event
export const trackGoogleAccountCreation = (username, userId) => {
  if (typeof window.gtag !== 'undefined') {
    window.gtag('event', 'sign_up', {
      method: 'email',
      value: 1,
      currency: 'USD',
      user_id: userId,
      custom_parameters: {
        username: username
      }
    });
    
    // Google Ads will automatically import this conversion from GA4
    // No need for separate Google Ads conversion tracking when using GA4
  }
};

// Reddit Pixel Event
export const trackRedditAccountCreation = (userId) => {
  if (typeof window.rdt !== 'undefined') {
    window.rdt('track', 'SignUp', {
      customEventName: 'AccountCreated',
      value: 1.00,
      currency: 'USD',
      transactionId: userId
    });
  }
};

// Facebook/Meta Pixel Event
export const trackFacebookAccountCreation = (username, userId) => {
  if (typeof window.fbq !== 'undefined') {
    window.fbq('track', 'CompleteRegistration', {
      value: 1.00,
      currency: 'USD',
      content_name: 'game_account',
      status: true,
      user_id: userId
    });
  }
};

// TikTok Pixel Event
export const trackTikTokAccountCreation = (userId) => {
  if (typeof window.ttq !== 'undefined') {
    window.ttq.track('CompleteRegistration', {
      value: 1.00,
      currency: 'USD',
      content_id: userId
    });
  }
};

// Master function to track across all platforms
export const trackAccountCreation = (username, userId) => {
  console.log('🎯 Tracking account creation for:', username, userId);
  
  // Track on all platforms
  trackGoogleAccountCreation(username, userId);
  trackRedditAccountCreation(userId);
  trackFacebookAccountCreation(username, userId);
  trackTikTokAccountCreation(userId);
  
  // You can add more platforms here as needed
};

// Track other important events
export const trackTutorialComplete = (userId) => {
  if (typeof window.gtag !== 'undefined') {
    window.gtag('event', 'tutorial_complete', {
      user_id: userId
    });
  }
  
  if (typeof window.rdt !== 'undefined') {
    window.rdt('track', 'Custom', {
      customEventName: 'TutorialComplete'
    });
  }
};

export const trackFirstPurchase = (userId, value) => {
  if (typeof window.gtag !== 'undefined') {
    window.gtag('event', 'purchase', {
      value: value,
      currency: 'USD',
      user_id: userId,
      items: [{
        item_name: 'in_game_purchase',
        price: value,
        quantity: 1
      }]
    });
  }
  
  if (typeof window.fbq !== 'undefined') {
    window.fbq('track', 'Purchase', {
      value: value,
      currency: 'USD',
      user_id: userId
    });
  }
};