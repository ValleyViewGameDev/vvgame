export function shareToNetwork(network, url) {
  let shareUrl = '';

  switch (network) {
    case 'facebook':
      shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
      break;
    case 'twitter':
      shareUrl = `https://twitter.com/intent/tweet?text=Come+play+Valley+View!&url=${encodeURIComponent(url)}`;
      break;
    case 'reddit':
      shareUrl = `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=Check+out+Valley+View!`;
      break;
    default:
      console.warn('Unsupported network:', network);
      return;
  }

  window.open(shareUrl, '_blank', 'noopener,noreferrer');
}

export function copyToClipboard(text) {
  navigator.clipboard.writeText(text)
    .then(() => alert('✅ Link copied to clipboard!'))
    .catch(() => alert('❌ Failed to copy link.'));
}