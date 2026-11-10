// Singleton manager for active conversations
class ConversationManager {
  constructor() {
    this.activeConversations = new Map(); // speakerId -> {emoji, topic, timestamp}
    this.relationshipOutcomes = new Map(); // speakerId -> {type: 'positive'|'negative', timestamp}
    this.listeners = new Set();
  }
  
  // Add a conversation bubble
  // matchState can be: false, 'match', or 'rival'
  // flip: draw the bubble mirrored (its tail hooking the other way), for the reply in a
  // back-and-forth so the two speakers' bubbles face each other (PixiRendererSpeech.js)
  addSpeech(speakerId, emoji, topic, matchState = false, { flip = false } = {}) {
    console.log('🗨️ ConversationManager.addSpeech:', { speakerId, emoji, topic, matchState });
    console.log('🗨️ Current active conversations:', Array.from(this.activeConversations.keys()));
    this.activeConversations.set(speakerId, {
      emoji,
      topic,
      timestamp: Date.now(),
      matchState,
      flip: !!flip,
    });
    this.notifyListeners();
  }
  
  // Remove a conversation bubble
  removeSpeech(speakerId) {
    console.log('🗨️ ConversationManager.removeSpeech:', speakerId);
    this.activeConversations.delete(speakerId);
    this.notifyListeners();
  }
  
  // Get active speech for a speaker
  getSpeech(speakerId) {
    return this.activeConversations.get(speakerId);
  }
  
  // Subscribe to changes
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  // Notify all listeners of changes
  notifyListeners() {
    this.listeners.forEach(listener => listener());
  }
  
  // Clear all conversations
  clear() {
    this.activeConversations.clear();
    this.relationshipOutcomes.clear();
    this.notifyListeners();
  }
  
  // Add relationship outcome VFX
  // emoji parameter is optional - if not provided, uses default based on isPositive
  showOutcome(speakerId, isPositive, emoji = null) {
    const defaultEmoji = isPositive ? '👍' : '👎';
    const finalEmoji = emoji || defaultEmoji;
    console.log('🎭 showOutcome called:', { speakerId, isPositive, emoji, defaultEmoji, finalEmoji });
    this.relationshipOutcomes.set(speakerId, {
      type: isPositive ? 'positive' : 'negative',
      emoji: finalEmoji,
      timestamp: Date.now()
    });
    this.notifyListeners();

    // Auto-remove after animation duration
    setTimeout(() => {
      this.relationshipOutcomes.delete(speakerId);
      this.notifyListeners();
    }, 2500); // 2.5 seconds for animation
  }
  
  // Get outcome for a speaker
  getOutcome(speakerId) {
    const outcome = this.relationshipOutcomes.get(speakerId);
    return outcome;
  }

  // Get all active speeches (for PixiJS renderer)
  getAllSpeeches() {
    return this.activeConversations;
  }

  // Get all active outcomes (for PixiJS renderer)
  getAllOutcomes() {
    return this.relationshipOutcomes;
  }
}

// Export singleton instance
export default new ConversationManager();