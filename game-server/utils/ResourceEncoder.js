// UltraCompactResourceEncoder.js
// Bit-packed encoding for maximum storage efficiency

const PROPERTY_FLAGS = {
  GROW_END: 1,        // 0000 0001
  CRAFT_END: 2,       // 0000 0010
  CRAFTED_ITEM: 4,    // 0000 0100
  QTY: 8,             // 0000 1000
  SIZE: 16,           // 0001 0000
  OCCUPIED: 32,       // 0010 0000
  STATION_LEVEL: 64,  // 0100 0000
  SLOTS: 128,         // 1000 0000 - array of crafting slot states
};

// Property order (must match flag order for decoding)
const PROPERTY_ORDER = [
  'growEnd',     // flag 1
  'craftEnd',    // flag 2
  'craftedItem', // flag 4
  'qty',         // flag 8
  'size',        // flag 16
  'occupied',    // flag 32
  'stationLevel', // flag 64
  'slots'        // flag 128
];

class UltraCompactResourceEncoder {
  constructor(masterResources) {
    this.typeToLayoutKey = new Map();
    this.layoutKeyToType = new Map();
    
    if (masterResources && Array.isArray(masterResources)) {
      masterResources.forEach((resource) => {
        if (resource.type && resource.layoutkey) {
          this.typeToLayoutKey.set(resource.type, resource.layoutkey);
          this.layoutKeyToType.set(resource.layoutkey, resource.type);
        } else {
          console.warn(`⚠️ Resource missing type or layoutkey:`, resource);
        }
      });
      console.log(`📦 ResourceEncoder initialized with ${this.typeToLayoutKey.size} resource types using layoutKey`);
    } else {
      console.warn('⚠️ ResourceEncoder initialized without masterResources');
    }
  }

  encode(resourceObj) {
    const layoutKey = this.typeToLayoutKey.get(resourceObj.type);
    if (layoutKey === undefined) {
      console.warn(`⚠️ Unknown resource type: ${resourceObj.type} - creating fallback encoding`);
      // Return a special encoding for unknown resources that preserves essential data
      return {
        x: resourceObj.x,
        y: resourceObj.y,
        type: resourceObj.type, // Preserve original type name
        layoutKey: 'UNKNOWN',
        // Preserve other properties that might be important
        ...(resourceObj.anchorKey && { anchorKey: resourceObj.anchorKey }),
        ...(resourceObj.passable !== undefined && { passable: resourceObj.passable }),
        ...(resourceObj.growEnd && { growEnd: resourceObj.growEnd }),
        ...(resourceObj.craftEnd && { craftEnd: resourceObj.craftEnd })
      };
    }
    
    // Start with: [layoutKey, x, y]
    const result = [layoutKey, resourceObj.x, resourceObj.y];
    
    // Calculate property flags and collect values
    let flags = 0;
    const values = [];
    
    PROPERTY_ORDER.forEach((propName, index) => {
      const flagValue = 1 << index; // 2^index
      let value = resourceObj[propName];

      if (value !== undefined && value !== null) {
        // Special handling for craftedItem: convert type to layoutKey
        if (propName === 'craftedItem' && typeof value === 'string') {
          const craftedItemLayoutKey = this.typeToLayoutKey.get(value);
          if (craftedItemLayoutKey) {
            value = craftedItemLayoutKey;
          } else {
            console.warn(`⚠️ No layoutKey found for craftedItem type: ${value}, using original value`);
          }
        }

        // Special handling for slots array: convert craftedItem in each slot to layoutKey, then JSON stringify
        if (propName === 'slots' && Array.isArray(value)) {
          const encodedSlots = value.map(slot => {
            if (!slot) return null;
            const encodedSlot = { ...slot };
            if (encodedSlot.craftedItem) {
              const slotItemLayoutKey = this.typeToLayoutKey.get(encodedSlot.craftedItem);
              if (slotItemLayoutKey) {
                encodedSlot.craftedItem = slotItemLayoutKey;
              }
            }
            return encodedSlot;
          });
          value = JSON.stringify(encodedSlots);
        }

        flags |= flagValue; // Set the bit
        values.push(value);
      }
    });
    
    // Only add flags byte if there are any properties
    if (flags > 0) {
      result.push(flags);
      result.push(...values);
    }
    
    return result;
  }

  decode(resourceArray) {
    // Handle unknown resource fallback format (object instead of array)
    if (!Array.isArray(resourceArray)) {
      if (resourceArray && typeof resourceArray === 'object' && resourceArray.layoutKey === 'UNKNOWN') {
        console.warn(`⚠️ Decoding unknown resource type: ${resourceArray.type}`);
        return resourceArray; // Return the preserved object as-is
      }
      throw new Error('Invalid resource format - expected array or unknown resource object');
    }

    if (resourceArray.length < 3) {
      throw new Error('Invalid resource array format');
    }

    const layoutKey = resourceArray[0];
    const x = resourceArray[1];
    const y = resourceArray[2];
    
    const type = this.layoutKeyToType.get(layoutKey);
    if (!type) {
      console.warn(`⚠️ Unknown layoutKey during decode: ${layoutKey} - creating placeholder`);
      return {
        type: `UNKNOWN_${layoutKey}`,
        x,
        y,
        layoutKey,
        _isUnknown: true
      };
    }
    
    const result = { type, x, y };
    
    // If there are more elements, decode properties
    if (resourceArray.length > 3) {
      const flags = resourceArray[3];
      let valueIndex = 4;
      
      PROPERTY_ORDER.forEach((propName, index) => {
        const flagValue = 1 << index;
        if (flags & flagValue) { // Check if bit is set
          if (valueIndex < resourceArray.length) {
            let value = resourceArray[valueIndex++];

            // Special handling for craftedItem: convert layoutKey back to type
            if (propName === 'craftedItem' && typeof value === 'string') {
              const craftedItemType = this.layoutKeyToType.get(value);
              if (craftedItemType) {
                value = craftedItemType;
              } else {
                console.warn(`⚠️ No type found for craftedItem layoutKey: ${value}, using original value`);
              }
            }

            // Special handling for slots: parse JSON and convert craftedItem layoutKeys back to types
            if (propName === 'slots' && typeof value === 'string') {
              try {
                const parsedSlots = JSON.parse(value);
                value = parsedSlots.map(slot => {
                  if (!slot) return null;
                  const decodedSlot = { ...slot };
                  if (decodedSlot.craftedItem) {
                    const slotItemType = this.layoutKeyToType.get(decodedSlot.craftedItem);
                    if (slotItemType) {
                      decodedSlot.craftedItem = slotItemType;
                    }
                  }
                  return decodedSlot;
                });
              } catch (e) {
                console.warn(`⚠️ Failed to parse slots JSON: ${e.message}`);
                value = [];
              }
            }

            result[propName] = value;
          }
        }
      });
    }
    
    return result;
  }

  // Helper to analyze space savings
  calculateSavings(originalObj, encoded) {
    const originalSize = JSON.stringify(originalObj).length;
    const encodedSize = JSON.stringify(encoded).length;
    const savings = ((originalSize - encodedSize) / originalSize * 100).toFixed(1);
    
    return {
      original: originalSize,
      encoded: encodedSize,
      savings: `${savings}%`,
      ratio: (encodedSize / originalSize).toFixed(2)
    };
  }

  // Batch encode array of resources
  encodeResources(resourcesArray) {
    return resourcesArray.map(resource => this.encode(resource));
  }

  // Batch decode array of encoded resources
  decodeResources(encodedArray) {
    return encodedArray.map(encoded => this.decode(encoded));
  }

  // Validate that decode(encode(obj)) === obj
  validateRoundTrip(resourceObj) {
    try {
      const encoded = this.encode(resourceObj);
      const decoded = this.decode(encoded);
      
      // Compare all properties
      const originalKeys = Object.keys(resourceObj).sort();
      const decodedKeys = Object.keys(decoded).sort();
      
      if (JSON.stringify(originalKeys) !== JSON.stringify(decodedKeys)) {
        return { valid: false, error: 'Key mismatch', original: originalKeys, decoded: decodedKeys };
      }
      
      for (const key of originalKeys) {
        if (resourceObj[key] !== decoded[key]) {
          return { 
            valid: false, 
            error: `Value mismatch for ${key}`, 
            original: resourceObj[key], 
            decoded: decoded[key] 
          };
        }
      }
      
      return { valid: true, encoded, decoded, savings: this.calculateSavings(resourceObj, encoded) };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}

module.exports = UltraCompactResourceEncoder;