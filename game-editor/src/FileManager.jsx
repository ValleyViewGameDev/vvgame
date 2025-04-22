import React, { useState } from 'react';
import './App.css'; // ✅ Ensure styles are managed in a separate file

const FileManager = ({ loadLayout, saveLayout, currentFile }) => {
  const [fileName, setFileName] = useState(currentFile || '');
  const [directory, setDirectory] = useState('homestead'); // Default value

  const handleSave = () => {
    console.log(`🔹 Save button clicked. File: ${fileName}, Directory: ${directory}`);

    if (!fileName) {
      alert('Please enter a file name.');
      return;
    }

    if (!directory) {
      alert('Please select a directory.');
      return;
    }

    saveLayout(fileName, directory);  // ✅ Ensuring directory gets passed correctly
  };

  const handleLoad = () => {
    console.log(`🔄 Load button clicked. File: ${fileName}, Directory: ${directory}`);
  
    if (!fileName) {
      alert('Please enter a file name.');
      return;
    }
  
    if (!directory) {
      alert('Please select a directory.');
      return;
    }
  
    loadLayout(fileName, directory);  // ✅ Ensuring directory gets passed correctly
  };


  return (
    <div className="file-manager">
      <input 
        type="text" 
        value={fileName} 
        onChange={(e) => setFileName(e.target.value)} 
        placeholder="Enter file name..."
        className="file-input"
      />
      
      <select 
        value={directory} 
        onChange={(e) => { 
          console.log(`🔄 Directory changed to: ${e.target.value}`);
          setDirectory(e.target.value); 
        }} 
        className="file-select"
      >
        <option value="homestead">homestead/</option>
        <option value="town">town/</option>
        <option value="valley0">valley0/</option>
        <option value="valley1">valley1/</option>
        <option value="valley2">valley2/</option>
        <option value="valley3">valley3/</option>
      </select>

      <div className="button-group">
        <button className="small-button" onClick={handleLoad}>Load</button>
        <button className="small-button save-button" onClick={handleSave}>Save</button>
      </div>
    </div>
  );
};

export default FileManager;