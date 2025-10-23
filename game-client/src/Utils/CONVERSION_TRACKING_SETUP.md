# Conversion Tracking Setup Guide

This guide explains how to set up conversion tracking for account creation across different advertising platforms.

## 1. Google Ads Setup

### A. Create Conversion Action
1. Log in to Google Ads
2. Go to Tools & Settings → Measurement → Conversions
3. Click the "+" button to create a new conversion
4. Select "Website" as the conversion source
5. Configure:
   - Category: "Sign-up"
   - Conversion name: "Game Account Creation"
   - Value: Set to $1 or your estimated customer value
   - Count: "One conversion per click"
   - Conversion window: 30 days
   - Attribution model: "Data-driven" or "Last click"

### B. Get Conversion ID
1. After creating the conversion, click on it
2. Select "Tag setup" → "Use Google Tag Manager"
3. Copy the Conversion ID (format: AW-XXXXXXXXX)
4. Copy the Conversion Label (format: XXXXXXXXXXXX)
5. Update `conversionTracking.js` line 20 with your IDs:
   ```javascript
   'send_to': 'AW-XXXXXXXXX/XXXXXXXXXXXX'
   ```

## 2. Reddit Ads Setup

### A. Install Reddit Pixel
1. Add this to your `public/index.html` before closing `</head>`:
```html
<!-- Reddit Pixel -->
<script>
!function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};p.callQueue=[];var t=d.createElement("script");t.src="https://www.redditstatic.com/ads/pixel.js",t.async=!0;var s=d.getElementsByTagName("script")[0];s.parentNode.insertBefore(t,s)}}(window,document);
rdt('init','t2_XXXXXXXX'); // Replace with your Reddit Pixel ID
rdt('track', 'PageVisit');
</script>
```

### B. Get Reddit Pixel ID
1. Log in to Reddit Ads Manager
2. Go to "Events Manager" in the top menu
3. Click "Reddit Pixel" → "Manage Pixel"
4. Copy your Pixel ID (format: t2_XXXXXXXX)
5. Replace 't2_XXXXXXXX' in the code above

### C. Create Conversion Event
1. In Reddit Ads Manager → Events Manager
2. Click "Custom Conversions" → "Create Custom Conversion"
3. Name: "Account Creation"
4. Event to track: "SignUp"
5. Custom Event Name: "AccountCreated"

## 3. Facebook/Meta Pixel Setup (Optional)

### A. Install Facebook Pixel
Add to `public/index.html` before `</head>`:
```html
<!-- Facebook Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', 'YOUR_PIXEL_ID'); // Replace with your Pixel ID
fbq('track', 'PageView');
</script>
```

## 4. TikTok Pixel Setup (Optional)

### A. Install TikTok Pixel
Add to `public/index.html` before `</head>`:
```html
<!-- TikTok Pixel Code -->
<script>
!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
  ttq.load('YOUR_PIXEL_ID'); // Replace with your Pixel ID
  ttq.page();
}(window, document, 'ttq');
</script>
```

## 5. Testing Your Setup

### Google Ads Testing
1. Install Google Tag Assistant Chrome extension
2. Visit your game and create a test account
3. Check Tag Assistant to verify the conversion fired

### Reddit Ads Testing
1. In Reddit Ads Manager → Events Manager
2. Look for your "AccountCreated" event in the activity log

### General Testing
1. Open browser console (F12)
2. Create a test account
3. Look for: "🎯 Tracking account creation for: [username] [userId]"

## 6. Creating Audiences

### Google Ads
1. Go to Tools & Settings → Audience Manager
2. Create a new audience based on your conversion
3. Use for remarketing or lookalike audiences

### Reddit Ads
1. Go to Audiences → Create Audience
2. Create "Custom Audience" based on SignUp event
3. Use for retargeting campaigns

## 7. Best Practices

1. **Privacy Compliance**: Ensure you have proper privacy policy and cookie consent
2. **Value Tracking**: Consider tracking lifetime value (LTV) for better optimization
3. **Event Parameters**: Add more parameters like:
   - User source (organic/paid)
   - Registration method
   - Initial game choices
4. **Testing**: Always test in a staging environment first
5. **Monitoring**: Set up alerts for conversion tracking failures

## 8. Additional Events to Track

The `conversionTracking.js` file also includes:
- `trackTutorialComplete()` - When users finish tutorial
- `trackFirstPurchase()` - First in-app purchase

Use these for creating more sophisticated audiences and optimizing campaigns.