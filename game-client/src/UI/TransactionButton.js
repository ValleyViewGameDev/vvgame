import React, { useState } from 'react';

/**
 * A button component that prevents transaction spamming by managing its own state
 * and ensuring only one transaction can be active at a time.
 */
const TransactionButton = ({ 
  onAction, 
  children, 
  disabled = false,
  transactionKey, // unique key for this action type
  className = '',
  style = {},
  ...props 
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [transactionId] = useState(() => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  const handleClick = async (e) => {
    if (isProcessing || disabled) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    setIsProcessing(true);
    try {
      await onAction(transactionId, transactionKey);
    } catch (error) {
      console.error('Transaction failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <button 
      {...props}
      onClick={handleClick}
      disabled={disabled || isProcessing}
      className={`${className} ${isProcessing ? 'processing' : ''}`}
      style={{
        ...style,
        opacity: (disabled || isProcessing) ? 0.6 : 1,
        cursor: (disabled || isProcessing) ? 'not-allowed' : 'pointer'
      }}
    >
      {isProcessing ? '⏳' : children}
    </button>
  );
};

export default TransactionButton;