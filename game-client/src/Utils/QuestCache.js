import axios from 'axios';
import API_BASE from '../config';

class QuestCache {
  constructor() {
    this.cache = null;
    this.cacheTime = null;
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes cache
    this.pendingRequest = null;
  }

  async getQuests() {
    // If we have a pending request, wait for it
    if (this.pendingRequest) {
      return this.pendingRequest;
    }

    // If cache is fresh, return it
    if (this.cache && this.cacheTime && (Date.now() - this.cacheTime < this.cacheExpiry)) {
      // Removed console.log to reduce spam
      return Promise.resolve(this.cache);
    }

    // Make new request and cache it
    console.log('🔄 Fetching fresh quests from API');
    this.pendingRequest = axios.get(`${API_BASE}/api/quests`)
      .then(response => {
        this.cache = response.data;
        this.cacheTime = Date.now();
        this.pendingRequest = null;
        return this.cache;
      })
      .catch(error => {
        this.pendingRequest = null;
        throw error;
      });

    return this.pendingRequest;
  }

  // Force cache refresh (e.g., after quest completion)
  invalidate() {
    console.log('🗑️ Invalidating quest cache');
    this.cache = null;
    this.cacheTime = null;
  }

  // Get quests for a specific NPC
  async getQuestsForNPC(npcType) {
    const allQuests = await this.getQuests();
    return allQuests.filter(quest => quest.giver === npcType);
  }
}

// Create singleton instance
const questCache = new QuestCache();

export default questCache;