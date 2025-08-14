// Singleton manager for active conversations
class ConversationManager {
  constructor() {
    this.activeConversations = new Map(); // speakerId -> {emoji, topic, timestamp}
    this.relationshipOutcomes = new Map(); // speakerId -> {type: 'positive'|'negative', timestamp}
    this.listeners = new Set();
  }
  
  // Add a conversation bubble
  addSpeech(speakerId, emoji, topic) {
    console.log('🗨️ ConversationManager.addSpeech:', { speakerId, emoji, topic });
    this.activeConversations.set(speakerId, {
      emoji,
      topic,
      timestamp: Date.now()
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
  showOutcome(speakerId, isPositive) {
    console.log('🎯 ConversationManager.showOutcome:', { speakerId, isPositive });
    this.relationshipOutcomes.set(speakerId, {
      type: isPositive ? 'positive' : 'negative',
      timestamp: Date.now()
    });
    this.notifyListeners();
    
    // Auto-remove after animation duration
    setTimeout(() => {
      this.relationshipOutcomes.delete(speakerId);
      this.notifyListeners();
    }, 2500); // 2.5 seconds to ensure animation completes
  }
  
  // Get outcome for a speaker
  getOutcome(speakerId) {
    return this.relationshipOutcomes.get(speakerId);
  }
}

// Export singleton instance
export default new ConversationManager();